<?php

declare(strict_types=1);

return [
    "id" => "202604080005_widen_id_columns",
    "up" => function (PDO $pdo): void {
        // Amplía estantes.id de VARCHAR(20) a VARCHAR(100) para soportar IDs más largos.
        $pdo->exec("ALTER TABLE estantes MODIFY COLUMN id VARCHAR(100) NOT NULL");

        // Amplía productos.shelf_id de VARCHAR(20) a VARCHAR(100) para mantener coherencia.
        $pdo->exec("ALTER TABLE productos MODIFY COLUMN shelf_id VARCHAR(100) NOT NULL");
    }
];
