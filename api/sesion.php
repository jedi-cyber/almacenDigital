<?php
require_once __DIR__ . "/database.php";

header("Content-Type: application/json; charset=utf-8");
cors_headers("GET, POST, PATCH, DELETE, OPTIONS");

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
    http_response_code(204);
    exit;
}

try {
    $pdo = db_connect(true);
    db_ensure_schema($pdo);
    cleanup_expired_sessions($pdo);
} catch (Throwable $e) {
    api_log_error($e, "sesion:db_connect");
    http_response_code(500);
    echo json_encode(["error" => "No se pudo conectar con sesiones.", "code" => "SESSION_DB_ERROR"]);
    exit;
}

if ($_SERVER["REQUEST_METHOD"] === "GET") {
    $token = get_bearer_token();
    $session = $token ? find_session($pdo, $token) : null;
    if (($_GET["scope"] ?? "") === "active") {
        if (!$session) {
            api_fail(401, "Sesion no valida.", "INVALID_SESSION");
        }
        echo json_encode([
            "sessions" => list_active_sessions($pdo, (int)$session["user"]["id"], $token)
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    echo json_encode(["session" => $session], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($_SERVER["REQUEST_METHOD"] === "POST") {
    $body = json_decode(file_get_contents("php://input"), true) ?: [];
    $email = valid_string($body["email"] ?? null, 180);
    $password = is_string($body["password"] ?? null) ? (string)$body["password"] : "";
    if (!$email || $password === "") {
        http_response_code(422);
        echo json_encode(["error" => "Correo y contraseña son obligatorios.", "code" => "MISSING_CREDENTIALS"]);
        exit;
    }
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        http_response_code(422);
        echo json_encode(["error" => "Correo invalido.", "code" => "INVALID_EMAIL"]);
        exit;
    }
    $session = create_session_for_credentials($pdo, $email, $password);
    if (!$session) {
        http_response_code(401);
        echo json_encode(["error" => "Credenciales incorrectas.", "code" => "INVALID_CREDENTIALS"]);
        exit;
    }
    echo json_encode(["session" => $session], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($_SERVER["REQUEST_METHOD"] === "PATCH") {
    $token = get_bearer_token();
    $session = $token ? find_session($pdo, $token) : null;
    if (!$session) {
        http_response_code(401);
        echo json_encode(["error" => "Sesion no valida.", "code" => "INVALID_SESSION"]);
        exit;
    }

    $body = json_decode(file_get_contents("php://input"), true) ?: [];
    $name = valid_string($body["name"] ?? null, 120);
    $email = valid_string($body["email"] ?? null, 180);
    $currentPassword = is_string($body["currentPassword"] ?? null) ? (string)$body["currentPassword"] : "";
    $newPassword = is_string($body["newPassword"] ?? null) ? (string)$body["newPassword"] : "";

    if (!$name || !$email) {
        http_response_code(422);
        echo json_encode(["error" => "Nombre y correo son obligatorios.", "code" => "INVALID_PROFILE"]);
        exit;
    }
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        http_response_code(422);
        echo json_encode(["error" => "Correo invalido.", "code" => "INVALID_EMAIL"]);
        exit;
    }
    if ($newPassword !== "" && strlen($newPassword) < 6) {
        http_response_code(422);
        echo json_encode(["error" => "La nueva contraseña debe tener al menos 6 caracteres.", "code" => "WEAK_PASSWORD"]);
        exit;
    }

    $updated = update_current_user_profile(
        $pdo,
        (int)$session["user"]["id"],
        $name,
        $email,
        $currentPassword,
        $newPassword
    );

    if ($updated["error"] ?? null) {
        http_response_code((int)($updated["status"] ?? 422));
        echo json_encode(["error" => $updated["error"], "code" => $updated["code"] ?? "PROFILE_ERROR"]);
        exit;
    }

    echo json_encode(["session" => find_session($pdo, $token)], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($_SERVER["REQUEST_METHOD"] === "DELETE") {
    $token = get_bearer_token();
    if ($token) {
        $session = find_session($pdo, $token);
        if (($_GET["scope"] ?? "") === "all" && $session) {
            $stmt = $pdo->prepare("DELETE FROM sesiones WHERE usuario_id = :usuario_id");
            $stmt->execute([":usuario_id" => (int)$session["user"]["id"]]);
        } else {
            $stmt = $pdo->prepare("DELETE FROM sesiones WHERE token_hash = :token_hash");
            $stmt->execute([":token_hash" => hash("sha256", $token)]);
        }
    }
    echo json_encode(["ok" => true]);
    exit;
}

http_response_code(405);
echo json_encode(["error" => "Metodo no permitido.", "code" => "METHOD_NOT_ALLOWED"]);

function create_session_for_credentials(PDO $pdo, string $email, string $password): ?array
{
    $select = $pdo->prepare("SELECT id, nombre, email, rol, password_hash FROM usuarios WHERE email = :email AND activo = 1 LIMIT 1");
    $select->execute([":email" => $email]);
    $user = $select->fetch(PDO::FETCH_ASSOC);
    if (!$user || !password_verify($password, (string)$user["password_hash"])) {
        return null;
    }

    $token = bin2hex(random_bytes(32));
    $expiresAt = (new DateTimeImmutable("+8 hours"))->format("Y-m-d H:i:s");

    $stmt = $pdo->prepare(
        "INSERT INTO sesiones (usuario_id, token_hash, ip_address, user_agent, expires_at, last_seen_at)
         VALUES (:usuario_id, :token_hash, :ip_address, :user_agent, :expires_at, NOW())"
    );
    $stmt->execute([
        ":usuario_id" => (int)$user["id"],
        ":token_hash" => hash("sha256", $token),
        ":ip_address" => $_SERVER["REMOTE_ADDR"] ?? null,
        ":user_agent" => substr($_SERVER["HTTP_USER_AGENT"] ?? "", 0, 255),
        ":expires_at" => $expiresAt,
    ]);
    prune_old_user_sessions($pdo, (int)$user["id"], hash("sha256", $token));

    return [
        "token" => $token,
        "expiresAt" => $expiresAt,
        "user" => [
            "id" => (int)$user["id"],
            "name" => $user["nombre"],
            "email" => $user["email"],
            "role" => $user["rol"],
        ],
    ];
}

function cleanup_expired_sessions(PDO $pdo): void
{
    $pdo->exec("DELETE FROM sesiones WHERE expires_at <= NOW()");
}

function prune_old_user_sessions(PDO $pdo, int $userId, string $currentTokenHash): void
{
    $stmt = $pdo->prepare(
        "DELETE FROM sesiones
         WHERE usuario_id = :usuario_id
           AND token_hash <> :current_token_hash
           AND id NOT IN (
             SELECT id FROM (
               SELECT id FROM sesiones
               WHERE usuario_id = :usuario_id_keep
               ORDER BY last_seen_at DESC, created_at DESC
               LIMIT 4
             ) keep_rows
           )"
    );
    $stmt->execute([
        ":usuario_id" => $userId,
        ":usuario_id_keep" => $userId,
        ":current_token_hash" => $currentTokenHash,
    ]);
}

function list_active_sessions(PDO $pdo, int $userId, string $currentToken): array
{
    $currentHash = hash("sha256", $currentToken);
    $stmt = $pdo->prepare(
        "SELECT id, token_hash, ip_address, user_agent, created_at, last_seen_at, expires_at
         FROM sesiones
         WHERE usuario_id = :usuario_id AND expires_at > NOW()
         ORDER BY last_seen_at DESC, created_at DESC"
    );
    $stmt->execute([":usuario_id" => $userId]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    return array_map(fn($row) => [
        "id" => (int)$row["id"],
        "current" => hash_equals((string)$row["token_hash"], $currentHash),
        "ipAddress" => $row["ip_address"],
        "userAgent" => $row["user_agent"],
        "createdAt" => $row["created_at"],
        "lastSeenAt" => $row["last_seen_at"],
        "expiresAt" => $row["expires_at"],
    ], $rows);
}

function find_session(PDO $pdo, string $token): ?array
{
    $stmt = $pdo->prepare(
        "SELECT
            s.expires_at,
            u.id,
            u.nombre,
            u.email,
            u.rol
         FROM sesiones s
         INNER JOIN usuarios u ON u.id = s.usuario_id
         WHERE s.token_hash = :token_hash
            AND s.expires_at > NOW()
            AND u.activo = 1
         LIMIT 1"
    );
    $stmt->execute([":token_hash" => hash("sha256", $token)]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        return null;
    }

    $update = $pdo->prepare("UPDATE sesiones SET last_seen_at = NOW() WHERE token_hash = :token_hash");
    $update->execute([":token_hash" => hash("sha256", $token)]);

    return [
        "token" => $token,
        "expiresAt" => $row["expires_at"],
        "user" => [
            "id" => (int)$row["id"],
            "name" => $row["nombre"],
            "email" => $row["email"],
            "role" => $row["rol"],
        ],
    ];
}

function update_current_user_profile(
    PDO $pdo,
    int $userId,
    string $name,
    string $email,
    string $currentPassword,
    string $newPassword
): array {
    $select = $pdo->prepare("SELECT id, email, password_hash FROM usuarios WHERE id = :id AND activo = 1 LIMIT 1");
    $select->execute([":id" => $userId]);
    $user = $select->fetch(PDO::FETCH_ASSOC);
    if (!$user) {
        return ["error" => "Usuario no encontrado.", "code" => "USER_NOT_FOUND", "status" => 404];
    }

    $duplicate = $pdo->prepare("SELECT id FROM usuarios WHERE email = :email AND id <> :id LIMIT 1");
    $duplicate->execute([":email" => $email, ":id" => $userId]);
    if ($duplicate->fetch(PDO::FETCH_ASSOC)) {
        return ["error" => "Ese correo ya esta en uso.", "code" => "EMAIL_TAKEN", "status" => 409];
    }

    $params = [
        ":id" => $userId,
        ":nombre" => $name,
        ":email" => $email,
    ];
    $passwordSql = "";

    $emailChanged = strcasecmp($email, (string)$user["email"]) !== 0;
    if (($emailChanged || $newPassword !== "") && ($currentPassword === "" || !password_verify($currentPassword, (string)$user["password_hash"]))) {
        return ["error" => "La contraseña actual no coincide.", "code" => "INVALID_CURRENT_PASSWORD", "status" => 403];
    }

    if ($newPassword !== "") {
        $passwordSql = ", password_hash = :password_hash";
        $params[":password_hash"] = password_hash($newPassword, PASSWORD_DEFAULT);
    }

    $stmt = $pdo->prepare(
        "UPDATE usuarios
         SET nombre = :nombre, email = :email{$passwordSql}
         WHERE id = :id"
    );
    $stmt->execute($params);

    return ["ok" => true];
}
