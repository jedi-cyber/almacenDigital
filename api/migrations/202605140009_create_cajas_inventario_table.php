<?php

declare(strict_types=1);

return [
    "id" => "202605140009_create_cajas_inventario_table",
    "up" => function (PDO $pdo): void {

        // Tabla principal: cada caja física registrada en un estante
        $pdo->exec(
            "CREATE TABLE IF NOT EXISTS cajas_inventario (
                id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                codigo_caja     VARCHAR(100) NOT NULL UNIQUE,   -- código generado / escaneado
                categoria_id    INT UNSIGNED NOT NULL,
                shelf_id        VARCHAR(20)  NOT NULL,          -- estante donde está ubicada
                unidades_actual INT UNSIGNED NOT NULL DEFAULT 0,
                unidades_max    INT UNSIGNED NOT NULL,          -- productos_x_caja de la categoría
                pos_x           FLOAT        NOT NULL DEFAULT 0, -- posición 3D dentro del estante
                pos_y           FLOAT        NOT NULL DEFAULT 0,
                pos_z           FLOAT        NOT NULL DEFAULT 0,
                estado          ENUM('ACTIVA','LLENA','VACIA') NOT NULL DEFAULT 'ACTIVA',
                created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                CONSTRAINT fk_caja_categoria
                    FOREIGN KEY (categoria_id) REFERENCES categorias(id)
                    ON UPDATE CASCADE ON DELETE RESTRICT
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
        );

        // Tabla de movimientos: cada vez que se escanea un producto y entra a una caja
        $pdo->exec(
            "CREATE TABLE IF NOT EXISTS movimientos_inventario (
                id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                caja_id         INT UNSIGNED NOT NULL,
                producto_sku    VARCHAR(100) NOT NULL,
                unidades        INT UNSIGNED NOT NULL DEFAULT 1,
                tipo            ENUM('ENTRADA','SALIDA') NOT NULL DEFAULT 'ENTRADA',
                registrado_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT fk_movimiento_caja
                    FOREIGN KEY (caja_id) REFERENCES cajas_inventario(id)
                    ON UPDATE CASCADE ON DELETE RESTRICT
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
        );
    }
];
