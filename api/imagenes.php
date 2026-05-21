<?php
require_once __DIR__ . "/database.php";

header("Content-Type: application/json; charset=utf-8");
cors_headers("POST, OPTIONS");

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
    http_response_code(204);
    exit;
}

if ($_SERVER["REQUEST_METHOD"] !== "POST") {
    http_response_code(405);
    echo json_encode(["error" => "Metodo no permitido.", "code" => "METHOD_NOT_ALLOWED"]);
    exit;
}

try {
    $pdo = db_connect(true);
    db_ensure_schema($pdo);
    $session = require_api_session($pdo);
    require_api_permission($session, "image:upload");
} catch (PDOException $e) {
    api_log_error($e, "imagenes:db_connect");
    http_response_code(500);
    echo json_encode(["error" => "No se pudo validar la sesion.", "code" => "IMAGE_AUTH_DB_ERROR"]);
    exit;
}

$file = $_FILES["image"] ?? null;
if (!$file || !is_array($file) || ($file["error"] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
    http_response_code(422);
    echo json_encode(["error" => "Selecciona una imagen valida.", "code" => "INVALID_IMAGE"]);
    exit;
}

$tmpName = (string)$file["tmp_name"];
if (!is_uploaded_file($tmpName)) {
    http_response_code(422);
    echo json_encode(["error" => "Carga de imagen invalida.", "code" => "INVALID_UPLOAD"]);
    exit;
}
$originalName = (string)($file["name"] ?? "");
if ($originalName !== "" && !preg_match('/\.(jpe?g|png|webp|gif)$/i', $originalName)) {
    http_response_code(422);
    echo json_encode(["error" => "Extension de imagen no permitida.", "code" => "UNSUPPORTED_IMAGE_EXTENSION"]);
    exit;
}
$mime = mime_content_type($tmpName) ?: "";
$allowed = [
    "image/jpeg" => "jpg",
    "image/png" => "png",
    "image/webp" => "webp",
    "image/gif" => "gif",
];

if (!isset($allowed[$mime])) {
    http_response_code(422);
    echo json_encode(["error" => "Formato no permitido. Usa JPG, PNG, WEBP o GIF.", "code" => "UNSUPPORTED_IMAGE"]);
    exit;
}

if (!getimagesize($tmpName)) {
    http_response_code(422);
    echo json_encode(["error" => "El archivo no es una imagen valida.", "code" => "INVALID_IMAGE_CONTENT"]);
    exit;
}

$size = (int)($file["size"] ?? 0);
if ($size <= 0 || $size > 4 * 1024 * 1024) {
    http_response_code(422);
    echo json_encode(["error" => "La imagen no debe superar 4 MB.", "code" => "IMAGE_TOO_LARGE"]);
    exit;
}

$uploadDir = dirname(__DIR__) . "/public/uploads/productos";
if (!is_dir($uploadDir)) {
    mkdir($uploadDir, 0755, true);
}

$name = "producto_" . date("Ymd_His") . "_" . bin2hex(random_bytes(6)) . "." . $allowed[$mime];
$target = $uploadDir . "/" . $name;

if (!move_uploaded_file($tmpName, $target)) {
    http_response_code(500);
    echo json_encode(["error" => "No se pudo guardar la imagen.", "code" => "IMAGE_SAVE_ERROR"]);
    exit;
}

echo json_encode(["url" => "/uploads/productos/{$name}"], JSON_UNESCAPED_SLASHES);
