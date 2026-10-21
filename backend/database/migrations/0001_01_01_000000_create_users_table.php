<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Migración de serie de Laravel, adaptada para convivir con el esquema
 * canónico (0000_00_00_000000_load_canonical_schema):
 *
 * - `users` ya la crea database/schema.sql en PostgreSQL (uuid, password_hash,
 *   organization_id...). Aquí solo se crea si no existe, lo que ocurre en
 *   SQLite durante las pruebas.
 * - `password_reset_tokens` y `sessions` no están en el esquema canónico; se
 *   crean si faltan. `sessions.user_id` es texto para admitir ids uuid.
 * - down() nunca borra tablas del esquema canónico.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('users')) {
            Schema::create('users', function (Blueprint $table) {
                $table->id();
                $table->string('name');
                $table->string('email')->unique();
                $table->timestamp('email_verified_at')->nullable();
                $table->string('password');
                $table->rememberToken();
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('password_reset_tokens')) {
            Schema::create('password_reset_tokens', function (Blueprint $table) {
                $table->string('email')->primary();
                $table->string('token');
                $table->timestamp('created_at')->nullable();
            });
        }

        if (! Schema::hasTable('sessions')) {
            Schema::create('sessions', function (Blueprint $table) {
                $table->string('id')->primary();
                $table->string('user_id', 36)->nullable()->index();
                $table->string('ip_address', 45)->nullable();
                $table->text('user_agent')->nullable();
                $table->longText('payload');
                $table->integer('last_activity')->index();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('password_reset_tokens');
        Schema::dropIfExists('sessions');

        // En PostgreSQL `users` pertenece al esquema canónico: no se borra aquí.
        if (Schema::getConnection()->getDriverName() !== 'pgsql') {
            Schema::dropIfExists('users');
        }
    }
};
