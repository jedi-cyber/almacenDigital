<?php

declare(strict_types=1);

require_once __DIR__ . "/database.php";

header("Content-Type: application/json; charset=utf-8");
cors_headers("GET, POST, PATCH, OPTIONS");

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
    http_response_code(204);
    exit;
}

try {
    $pdo = db_connect(true);
    db_ensure_schema($pdo);
    $session = require_api_session($pdo);
    require_api_permission($session, "user:manage");
} catch (PDOException $e) {
    api_log_error($e, "usuarios:db_connect");
    http_response_code(500);
    echo json_encode(["error" => "No se pudo conectar con usuarios.", "code" => "USER_DB_ERROR"]);
    exit;
}

if ($_SERVER["REQUEST_METHOD"] === "GET") {
    echo json_encode(["users" => list_users($pdo)], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($_SERVER["REQUEST_METHOD"] === "POST") {
    $body = json_decode(file_get_contents("php://input"), true) ?: [];
    $name = valid_string($body["name"] ?? null, 120);
    $email = valid_string($body["email"] ?? null, 180);
    $role = canonical_user_role((string)($body["role"] ?? ""));
    $password = is_string($body["password"] ?? null) ? (string)$body["password"] : "";

    if (!$name || !$email || !$role || strlen($password) < 6 || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        http_response_code(422);
        echo json_encode(["error" => "Nombre, correo, rol y contraseña valida son obligatorios.", "code" => "INVALID_USER"]);
        exit;
    }

    try {
        $stmt = $pdo->prepare(
            "INSERT INTO usuarios (nombre, email, rol, password_hash, activo)
             VALUES (:nombre, :email, :rol, :password_hash, 1)"
        );
        $stmt->execute([
            ":nombre" => $name,
            ":email" => $email,
            ":rol" => $role,
            ":password_hash" => password_hash($password, PASSWORD_DEFAULT),
        ]);
    } catch (Throwable $e) {
        api_log_error($e, "usuarios:POST");
        http_response_code(409);
        echo json_encode(["error" => "No se pudo crear el usuario. Revisa si el correo ya existe.", "code" => "USER_CREATE_ERROR"]);
        exit;
    }

    echo json_encode(["users" => list_users($pdo)], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($_SERVER["REQUEST_METHOD"] === "PATCH") {
    $body = json_decode(file_get_contents("php://input"), true) ?: [];
    $userId = isset($body["id"]) && is_numeric($body["id"]) ? (int)$body["id"] : 0;
    if ($userId <= 0) {
        http_response_code(422);
        echo json_encode(["error" => "ID de usuario invalido.", "code" => "INVALID_USER_ID"]);
        exit;
    }

    $currentUserId = (int)$session["user"]["id"];
    $existing = find_user_by_id($pdo, $userId);
    if (!$existing) {
        http_response_code(404);
        echo json_encode(["error" => "Usuario no encontrado.", "code" => "USER_NOT_FOUND"]);
        exit;
    }

    $name = array_key_exists("name", $body) ? valid_string($body["name"], 120) : $existing["nombre"];
    $email = array_key_exists("email", $body) ? valid_string($body["email"], 180) : $existing["email"];
    $role = array_key_exists("role", $body) ? canonical_user_role((string)$body["role"]) : $existing["rol"];
    $active = array_key_exists("active", $body) ? (bool)$body["active"] : (bool)$existing["activo"];
    $password = is_string($body["password"] ?? null) ? (string)$body["password"] : "";

    if (!$name || !$email || !$role || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        http_response_code(422);
        echo json_encode(["error" => "Datos de usuario invalidos.", "code" => "INVALID_USER"]);
        exit;
    }
    if ($password !== "" && strlen($password) < 6) {
        http_response_code(422);
        echo json_encode(["error" => "La contraseña debe tener al menos 6 caracteres.", "code" => "WEAK_PASSWORD"]);
        exit;
    }
    if ($userId === $currentUserId && !$active) {
        http_response_code(422);
        echo json_encode(["error" => "No puedes desactivar tu propia cuenta.", "code" => "SELF_DISABLE_BLOCKED"]);
        exit;
    }
    if (would_remove_last_admin($pdo, $userId, $role, $active)) {
        http_response_code(422);
        echo json_encode(["error" => "Debe quedar al menos un administrador activo.", "code" => "LAST_ADMIN_BLOCKED"]);
        exit;
    }

    $params = [
        ":id" => $userId,
        ":nombre" => $name,
        ":email" => $email,
        ":rol" => $role,
        ":activo" => $active ? 1 : 0,
    ];
    $passwordSql = "";
    if ($password !== "") {
        $passwordSql = ", password_hash = :password_hash";
        $params[":password_hash"] = password_hash($password, PASSWORD_DEFAULT);
    }

    try {
        $stmt = $pdo->prepare(
            "UPDATE usuarios
             SET nombre = :nombre, email = :email, rol = :rol, activo = :activo{$passwordSql}
             WHERE id = :id"
        );
        $stmt->execute($params);
        if (!$active) {
            $logout = $pdo->prepare("DELETE FROM sesiones WHERE usuario_id = :usuario_id");
            $logout->execute([":usuario_id" => $userId]);
        }
    } catch (Throwable $e) {
        api_log_error($e, "usuarios:PATCH id={$userId}");
        http_response_code(409);
        echo json_encode(["error" => "No se pudo actualizar el usuario.", "code" => "USER_UPDATE_ERROR"]);
        exit;
    }

    echo json_encode(["users" => list_users($pdo)], JSON_UNESCAPED_UNICODE);
    exit;
}

http_response_code(405);
echo json_encode(["error" => "Metodo no permitido.", "code" => "METHOD_NOT_ALLOWED"]);

function list_users(PDO $pdo): array
{
    $rows = $pdo->query(
        "SELECT id, nombre, email, rol, activo, created_at, updated_at
         FROM usuarios
         ORDER BY activo DESC, nombre ASC"
    )->fetchAll(PDO::FETCH_ASSOC);

    return array_map(fn($row) => [
        "id" => (int)$row["id"],
        "name" => $row["nombre"],
        "email" => $row["email"],
        "role" => canonical_user_role((string)$row["rol"]) ?? $row["rol"],
        "active" => (bool)$row["activo"],
        "createdAt" => $row["created_at"],
        "updatedAt" => $row["updated_at"],
    ], $rows);
}

function find_user_by_id(PDO $pdo, int $userId): ?array
{
    $stmt = $pdo->prepare("SELECT id, nombre, email, rol, activo FROM usuarios WHERE id = :id LIMIT 1");
    $stmt->execute([":id" => $userId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

function would_remove_last_admin(PDO $pdo, int $userId, string $nextRole, bool $nextActive): bool
{
    $current = find_user_by_id($pdo, $userId);
    if (!$current || normalize_user_role((string)$current["rol"]) !== "admin") {
        return false;
    }
    if ($nextActive && normalize_user_role($nextRole) === "admin") {
        return false;
    }
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM usuarios WHERE activo = 1 AND id <> :id AND LOWER(rol) IN ('admin', 'administrador')");
    $stmt->execute([":id" => $userId]);
    return (int)$stmt->fetchColumn() === 0;
}
