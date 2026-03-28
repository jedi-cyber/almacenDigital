<?php

declare(strict_types=1);

return [
    "id" => "202603270003_add_sections_to_estantes",
    "up" => function (PDO $pdo): void {
        $columns = $pdo->query("SHOW COLUMNS FROM estantes LIKE 'sections'")->fetchAll(PDO::FETCH_ASSOC);
        if (count($columns) === 0) {
            $pdo->exec("ALTER TABLE estantes ADD COLUMN sections INT NOT NULL DEFAULT 1 AFTER label");
        }
    }
];
