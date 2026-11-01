<?php

declare(strict_types=1);

namespace Tests\Unit\Shared;

use App\Shared\Http\Problem\ProblemException;
use PHPUnit\Framework\TestCase;

final class ProblemExceptionTest extends TestCase
{
    public function test_forbidden_factory(): void
    {
        $exception = ProblemException::forbidden();

        $this->assertSame(403, $exception->status);
        $this->assertSame('forbidden', $exception->problemCode);
    }

    public function test_mfa_required_factory(): void
    {
        $exception = ProblemException::mfaRequired();

        $this->assertSame(403, $exception->status);
        $this->assertSame('mfa_required', $exception->problemCode);
    }

    public function test_not_found_factory(): void
    {
        $exception = ProblemException::notFound();

        $this->assertSame(404, $exception->status);
        $this->assertSame('not_found', $exception->problemCode);
    }

    public function test_version_conflict_factory(): void
    {
        $exception = ProblemException::versionConflict(7);

        $this->assertSame(409, $exception->status);
        $this->assertSame('version_conflict', $exception->problemCode);
        $this->assertSame(7, $exception->extra['current_version']);
    }

    public function test_bad_request_factory(): void
    {
        $exception = ProblemException::badRequest('x');

        $this->assertSame(400, $exception->status);
        $this->assertSame('bad_request', $exception->problemCode);
        $this->assertSame('x', $exception->getMessage());
    }

    public function test_validation_factory(): void
    {
        $exception = ProblemException::validation(['campo' => ['req']]);

        $this->assertSame(422, $exception->status);
        $this->assertSame('validation_failed', $exception->problemCode);
        $this->assertArrayHasKey('campo', $exception->extra['errors']);
    }
}
