<?php

declare(strict_types=1);

return [
    "id" => "202605140008_create_categorias_table",
    "up" => function (PDO $pdo): void {

        $pdo->exec(
            "CREATE TABLE IF NOT EXISTS categorias (
                id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                nombre          VARCHAR(100) NOT NULL UNIQUE,
                tipo_caja       ENUM('GRANDE','MEDIANO','PEQUEÑO') NOT NULL,
                medida_caja     VARCHAR(50)  NOT NULL,
                productos_x_caja INT UNSIGNED NOT NULL,
                total_productos INT UNSIGNED NOT NULL DEFAULT 0,
                cajas_necesarias INT UNSIGNED NOT NULL DEFAULT 0,
                created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
        );

        $categorias = [
            ["CONSUMIBLE PARA IMPRESORA",        "GRANDE",   "60 x 50 x 40 cm",  1,  167, 167],
            ["COMPONENTE DE COMPUTADORA",         "GRANDE",   "60 x 50 x 40 cm",  1,  156, 156],
            ["PERIFÉRICO",                        "MEDIANO",  "35 x 30 x 25 cm",  5,   94,  19],
            ["CONSUMIBLE DE IMPRESIÓN",           "PEQUEÑO",  "20 x 15 x 10 cm", 15,   63,   5],
            ["AUDIO",                             "MEDIANO",  "35 x 30 x 25 cm",  5,   56,  12],
            ["COMPONENTE DE ALMACENAMIENTO",      "MEDIANO",  "35 x 30 x 25 cm",  5,   41,   9],
            ["ACCESORIO DE COMPUTADORA",          "GRANDE",   "60 x 50 x 40 cm",  1,   28,  28],
            ["CABLE Y ADAPTADOR",                 "PEQUEÑO",  "20 x 15 x 10 cm", 15,   24,   2],
            ["ACCESORIO DE RED",                  "MEDIANO",  "35 x 30 x 25 cm",  5,   22,   5],
            ["CATEGORIA GENERAL",                 "PEQUEÑO",  "20 x 15 x 10 cm", 15,   22,   2],
            ["COMPUTADORA",                       "GRANDE",   "60 x 50 x 40 cm",  1,   19,  19],
            ["TINTAS",                            "PEQUEÑO",  "20 x 15 x 10 cm", 15,   18,   2],
            ["ACCESORIO PARA COMPUTADORA",        "GRANDE",   "60 x 50 x 40 cm",  1,   14,  14],
            ["CARTUCHOS",                         "PEQUEÑO",  "20 x 15 x 10 cm", 15,   14,   1],
            ["IMPRESORA",                         "GRANDE",   "60 x 50 x 40 cm",  1,   14,  14],
            ["ACCESORIO ELÉCTRICO",               "PEQUEÑO",  "20 x 15 x 10 cm", 15,   13,   1],
            ["SOFTWARE",                          "PEQUEÑO",  "20 x 15 x 10 cm", 15,    9,   1],
            ["TONERS",                            "PEQUEÑO",  "20 x 15 x 10 cm", 15,    9,   1],
            ["CAJA",                              "PEQUEÑO",  "20 x 15 x 10 cm", 15,    9,   1],
            ["ELECTRÓNICO",                       "PEQUEÑO",  "20 x 15 x 10 cm", 15,    8,   1],
            ["LAPTOP",                            "PEQUEÑO",  "20 x 15 x 10 cm", 15,    8,   1],
            ["ACCESORIO DE VIDEO",                "PEQUEÑO",  "20 x 15 x 10 cm", 15,    7,   1],
            ["ACCESORIO DE ENERGÍA",              "PEQUEÑO",  "20 x 15 x 10 cm", 15,    7,   1],
            ["CARGADORES",                        "PEQUEÑO",  "20 x 15 x 10 cm", 15,    7,   1],
            ["CABLES",                            "PEQUEÑO",  "20 x 15 x 10 cm", 15,    7,   1],
            ["VIDEOVIGILANCIA",                   "PEQUEÑO",  "20 x 15 x 10 cm", 15,    6,   1],
            ["ACCESORIO FOTOGRÁFICO",             "PEQUEÑO",  "20 x 15 x 10 cm", 15,    6,   1],
            ["ACCESORIO DE ALMACENAMIENTO",       "MEDIANO",  "35 x 30 x 25 cm",  5,    5,   1],
            ["ROUTER",                            "PEQUEÑO",  "20 x 15 x 10 cm", 15,    5,   1],
            ["MONITORES",                         "GRANDE",   "60 x 50 x 40 cm",  1,    5,   5],
            ["COMPONENTE PARA SERVIDOR",          "GRANDE",   "60 x 50 x 40 cm",  1,    5,   5],
            ["TARJETA DE EXPANSIÓN",              "PEQUEÑO",  "20 x 15 x 10 cm", 15,    5,   1],
            ["SWITCH",                            "PEQUEÑO",  "20 x 15 x 10 cm", 15,    4,   1],
            ["ACCESORIO DE OFICINA",              "PEQUEÑO",  "20 x 15 x 10 cm", 15,    4,   1],
            ["ACCESORIO DE AUDIO",                "MEDIANO",  "35 x 30 x 25 cm",  5,    4,   1],
            ["ACCESORIOS",                        "PEQUEÑO",  "20 x 15 x 10 cm", 15,    4,   1],
            ["PAD MOUSE",                         "PEQUEÑO",  "20 x 15 x 10 cm", 15,    4,   1],
            ["USB",                               "PEQUEÑO",  "20 x 15 x 10 cm", 15,    4,   1],
            ["ELECTRÓNICO INTELIGENTE",           "PEQUEÑO",  "20 x 15 x 10 cm", 15,    4,   1],
            ["COMPONENTE DE SERVIDOR",            "GRANDE",   "60 x 50 x 40 cm",  1,    4,   4],
            ["MOUSES",                            "PEQUEÑO",  "20 x 15 x 10 cm", 15,    3,   1],
            ["ACCESORIO DE LIMPIEZA",             "PEQUEÑO",  "20 x 15 x 10 cm", 15,    3,   1],
            ["PROCESADOR",                        "PEQUEÑO",  "20 x 15 x 10 cm", 15,    3,   1],
            ["HARDWARE",                          "PEQUEÑO",  "20 x 15 x 10 cm", 15,    3,   1],
            ["CABLE Y CONECTOR",                  "PEQUEÑO",  "20 x 15 x 10 cm", 15,    3,   1],
            ["CASES",                             "PEQUEÑO",  "20 x 15 x 10 cm", 15,    3,   1],
            ["MERCHANDISING",                     "PEQUEÑO",  "20 x 15 x 10 cm", 15,    2,   1],
            ["ESTABILIZADORES / UPS",             "GRANDE",   "60 x 50 x 40 cm",  1,    2,   2],
            ["ADAPTADORES INALAMBRICO",           "PEQUEÑO",  "20 x 15 x 10 cm", 15,    2,   1],
            ["SUPRESOR DE PICOS",                 "PEQUEÑO",  "20 x 15 x 10 cm", 15,    2,   1],
            ["SUMINISTROS",                       "PEQUEÑO",  "20 x 15 x 10 cm", 15,    2,   1],
            ["CAMARAS",                           "PEQUEÑO",  "20 x 15 x 10 cm", 15,    2,   1],
            ["REDES",                             "MEDIANO",  "35 x 30 x 25 cm",  5,    2,   1],
            ["ACCESORIO DE SEGURIDAD",            "PEQUEÑO",  "20 x 15 x 10 cm", 15,    2,   1],
            ["PASTA TERMICA",                     "PEQUEÑO",  "20 x 15 x 10 cm", 15,    2,   1],
            ["MATERIAL DE OFICINA / PAPELERÍA",   "PEQUEÑO",  "20 x 15 x 10 cm", 15,    2,   1],
            ["LECTRÓNICO PARA EL HOGAR",          "PEQUEÑO",  "20 x 15 x 10 cm", 15,    2,   1],
            ["ACCESORIO PARA TABLET",             "PEQUEÑO",  "20 x 15 x 10 cm", 15,    2,   1],
            ["AURICULAR",                         "PEQUEÑO",  "20 x 15 x 10 cm", 15,    2,   1],
            ["ANTIVIRUS",                         "PEQUEÑO",  "20 x 15 x 10 cm", 15,    2,   1],
            ["DISCO SOLIDO",                      "PEQUEÑO",  "20 x 15 x 10 cm", 15,    2,   1],
            ["CONSUMIBLE DE ALMACENAMIENTO",      "MEDIANO",  "35 x 30 x 25 cm",  5,    2,   1],
            ["CONSUMIBLE DE GRABACIÓN",           "PEQUEÑO",  "20 x 15 x 10 cm", 15,    2,   1],
            ["ACCESORIO PARA LAPTOP",             "PEQUEÑO",  "20 x 15 x 10 cm", 15,    2,   1],
            ["ACCESORIOS DE RED",                 "MEDIANO",  "35 x 30 x 25 cm",  5,    1,   1],
            ["REGALOS",                           "PEQUEÑO",  "20 x 15 x 10 cm", 15,    1,   1],
            ["COOLER",                            "PEQUEÑO",  "20 x 15 x 10 cm", 15,    1,   1],
            ["SENSOR",                            "PEQUEÑO",  "20 x 15 x 10 cm", 15,    1,   1],
            ["CAJA ADOSABLE",                     "PEQUEÑO",  "20 x 15 x 10 cm", 15,    1,   1],
            ["ACCESORIO PARA CONSOLA",            "PEQUEÑO",  "20 x 15 x 10 cm", 15,    1,   1],
            ["FOTOGRAFÍA Y VIDEO",                "PEQUEÑO",  "20 x 15 x 10 cm", 15,    1,   1],
            ["TABLET",                            "PEQUEÑO",  "20 x 15 x 10 cm", 15,    1,   1],
            ["FUENTE DE PODER",                   "PEQUEÑO",  "20 x 15 x 10 cm", 15,    1,   1],
            ["TARJETA DE RED",                    "MEDIANO",  "35 x 30 x 25 cm",  5,    1,   1],
            ["TARJETAS DE VIDEO",                 "PEQUEÑO",  "20 x 15 x 10 cm", 15,    1,   1],
            ["TECLADOS",                          "PEQUEÑO",  "20 x 15 x 10 cm", 15,    1,   1],
            ["ACCESORIO DE MONITOR",              "GRANDE",   "60 x 50 x 40 cm",  1,    1,   1],
            ["UTILES DE ESCRITORIO",              "PEQUEÑO",  "20 x 15 x 10 cm", 15,    1,   1],
            ["ADAPTADOR",                         "PEQUEÑO",  "20 x 15 x 10 cm", 15,    1,   1],
            ["PUNTERO LASER",                     "PEQUEÑO",  "20 x 15 x 10 cm", 15,    1,   1],
            ["CARGADOR",                          "PEQUEÑO",  "20 x 15 x 10 cm", 15,    1,   1],
            ["DISCOS DUROS",                      "PEQUEÑO",  "20 x 15 x 10 cm", 15,    1,   1],
            ["EQUIPO DE SEGURIDAD PARA HOGAR",    "PEQUEÑO",  "20 x 15 x 10 cm", 15,    1,   1],
            ["HERRAMIENTA DE DIAGNÓSTICO",        "PEQUEÑO",  "20 x 15 x 10 cm", 15,    1,   1],
            ["EQUIPO DE PROTECCIÓN PERSONAL",     "PEQUEÑO",  "20 x 15 x 10 cm", 15,    1,   1],
            ["IMPRESORAS",                        "GRANDE",   "60 x 50 x 40 cm",  1,    1,   1],
            ["JUGUETE",                           "PEQUEÑO",  "20 x 15 x 10 cm", 15,    1,   1],
            ["KIT DE LIMPIEZA",                   "PEQUEÑO",  "20 x 15 x 10 cm", 15,    1,   1],
            ["ACCESORIO DE VIDEOVIGILANCIA",      "PEQUEÑO",  "20 x 15 x 10 cm", 15,    1,   1],
            ["EQUIPO DE OFICINA",                 "PEQUEÑO",  "20 x 15 x 10 cm", 15,    1,   1],
            ["EQUIPO DE CONTROL",                 "PEQUEÑO",  "20 x 15 x 10 cm", 15,    1,   1],
            ["CONECTORES",                        "PEQUEÑO",  "20 x 15 x 10 cm", 15,    1,   1],
            ["ACCESORIO PARA TELÉFONO",           "PEQUEÑO",  "20 x 15 x 10 cm", 15,    1,   1],
            ["MOUSE",                             "PEQUEÑO",  "20 x 15 x 10 cm", 15,    1,   1],
            ["ACCESORIO PARA MÓVIL",              "PEQUEÑO",  "20 x 15 x 10 cm", 15,    1,   1],
            ["ACCESORIO PARA VEHÍCULO",           "PEQUEÑO",  "20 x 15 x 10 cm", 15,    1,   1],
            ["ACCESORIO GAMER",                   "PEQUEÑO",  "20 x 15 x 10 cm", 15,    1,   1],
            ["COMPUTADORAS",                      "GRANDE",   "60 x 50 x 40 cm",  1,    1,   1],
        ];

        $stmt = $pdo->prepare(
            "INSERT IGNORE INTO categorias
                (nombre, tipo_caja, medida_caja, productos_x_caja, total_productos, cajas_necesarias)
             VALUES
                (:nombre, :tipo_caja, :medida_caja, :productos_x_caja, :total_productos, :cajas_necesarias)"
        );

        foreach ($categorias as [$nombre, $tipo, $medida, $pxc, $total, $cajas]) {
            $stmt->execute([
                ":nombre"           => $nombre,
                ":tipo_caja"        => $tipo,
                ":medida_caja"      => $medida,
                ":productos_x_caja" => $pxc,
                ":total_productos"  => $total,
                ":cajas_necesarias" => $cajas,
            ]);
        }
    }
];