<?php

namespace Tests\Feature;

// use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ExampleTest extends TestCase
{
    /**
     * La raíz redirige al panel de administración (la SPA se sirve en /admin/).
     */
    public function test_root_redirects_to_admin(): void
    {
        $this->get('/')->assertRedirect('/admin/');
    }
}
