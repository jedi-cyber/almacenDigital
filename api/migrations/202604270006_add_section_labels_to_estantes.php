<?php

declare(strict_types=1);

return [
    "id" => "202604270006_add_section_labels_to_estantes",
    "up" => function (PDO $pdo): void {
        $columns = $pdo->query("SHOW COLUMNS FROM estantes LIKE 'section_labels'")->fetchAll(PDO::FETCH_ASSOC);
        if (count($columns) === 0) {
            $pdo->exec("ALTER TABLE estantes ADD COLUMN section_labels TEXT DEFAULT NULL AFTER board_offsets");
        }
    }
];
