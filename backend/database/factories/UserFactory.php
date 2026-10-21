<?php

namespace Database\Factories;

use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * @extends Factory<User>
 */
class UserFactory extends Factory
{
    /**
     * The current password being used by the factory.
     */
    protected static ?string $password;

    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        // Columnas de la tabla canónica `users`; organization_id lo rellena BelongsToOrganization.
        return [
            'name' => fake()->name(),
            'email' => fake()->unique()->safeEmail(),
            'type' => 'staff',
            'email_verified_at' => now(),
            'password_hash' => static::$password ??= Hash::make(Str::random(32)),
        ];
    }

    /** Contraseña conocida para la prueba (nunca una fija en el código de producción). */
    public function withPassword(string $plain): static
    {
        return $this->state(fn () => ['password_hash' => Hash::make($plain), 'password_changed_at' => now()]);
    }

    public function customer(): static
    {
        return $this->state(fn () => ['type' => 'customer']);
    }

    /**
     * Indicate that the model's email address should be unverified.
     */
    public function unverified(): static
    {
        return $this->state(fn (array $attributes) => [
            'email_verified_at' => null,
        ]);
    }
}
