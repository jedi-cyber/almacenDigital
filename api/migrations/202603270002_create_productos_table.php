<?php

declare(strict_types=1);

return [
    "id" => "202603270002_create_productos_table",
    "up" => function (PDO $pdo): void {
        $pdo->exec(
            "CREATE TABLE IF NOT EXISTS productos (
                sku VARCHAR(100) NOT NULL PRIMARY KEY,
                shelf_id VARCHAR(20) NOT NULL,
                name VARCHAR(200) NOT NULL,
                width FLOAT NOT NULL,
                height FLOAT NOT NULL,
                depth FLOAT NOT NULL,
                local_x FLOAT NOT NULL DEFAULT 0,
                local_y FLOAT NOT NULL DEFAULT 0,
                local_z FLOAT NOT NULL DEFAULT 0
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
        );
    }
];
