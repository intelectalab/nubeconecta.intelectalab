<?php

declare(strict_types=1);

namespace Tests\Feature\Files;

use App\Modules\Files\Models\File;
use App\Modules\Files\Services\FileService;
use Tests\TestCase;

/** El disco local (serve=true, privado) debe entregar una URL FIRMADA; sin firma la ruta de servido da 403. */
final class TemporaryUrlTest extends TestCase
{
    public function test_local_disk_temporary_url_is_signed(): void
    {
        $file = (new File)->forceFill(['disk' => 'local', 'path' => 'organizations/x/ticket/abc.pdf']);

        $url = app(FileService::class)->temporaryUrl($file);

        $this->assertStringContainsString('signature=', $url);
        $this->assertStringContainsString('expires=', $url);
    }
}
