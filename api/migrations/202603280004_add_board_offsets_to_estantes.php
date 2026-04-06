<?php

declare(strict_types=1);

return [
    "id" => "202603280004_add_board_offsets_to_estantes",
    "up" => function (PDO $pdo): void {
        $columns = $pdo->query("SHOW COLUMNS FROM estantes LIKE 'board_offsets'")->fetchAll(PDO::FETCH_ASSOC);
        if (count($columns) === 0) {
            $pdo->exec("ALTER TABLE estantes ADD COLUMN board_offsets TEXT NULL AFTER sections");
        }
    }
];
