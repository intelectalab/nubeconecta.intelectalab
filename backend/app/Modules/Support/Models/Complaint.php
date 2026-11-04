<?php

declare(strict_types=1);

namespace App\Modules\Support\Models;

use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Complaint extends Model
{
    use BelongsToOrganization, HasUuids, TracksVersionAndActor;

    protected $table = 'complaints';
    protected $fillable = ['brand_id', 'wp_site_id', 'number', 'code', 'complaint_type', 'consumer_name', 'consumer_document_type', 'consumer_document_number', 'consumer_address', 'consumer_email', 'consumer_phone', 'is_minor', 'guardian_name', 'customer_id', 'service_id', 'service_description', 'amount_minor', 'currency', 'detail', 'consumer_request', 'status', 'received_at', 'response_days', 'due_at', 'ticket_id', 'acknowledgement_file_id', 'acknowledgement_sent_at', 'sheet_token_hash', 'answered_at', 'closed_at', 'ip_hash', 'is_test', 'test_marked_at', 'test_marked_by', 'test_reason'];
    protected $attributes = ['version' => 1, 'status' => 'received', 'is_minor' => false, 'is_test' => false];

    protected function casts(): array { return ['is_minor' => 'boolean', 'is_test' => 'boolean', 'amount_minor' => 'integer', 'number' => 'integer', 'response_days' => 'integer', 'version' => 'integer', 'received_at' => 'datetime', 'due_at' => 'datetime', 'acknowledgement_sent_at' => 'datetime', 'answered_at' => 'datetime', 'closed_at' => 'datetime', 'test_marked_at' => 'datetime']; }

    public function responses(): HasMany { return $this->hasMany(ComplaintResponse::class)->orderBy('sent_at'); }
}
