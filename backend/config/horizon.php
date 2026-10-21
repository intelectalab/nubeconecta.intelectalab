<?php

use Illuminate\Support\Str;

return [

    /*
    |--------------------------------------------------------------------------
    | Horizon Name
    |--------------------------------------------------------------------------
    |
    | This name appears in notifications and in the Horizon UI. Unique names
    | can be useful while running multiple instances of Horizon within an
    | application, allowing you to identify the Horizon you're viewing.
    |
    */

    'name' => env('HORIZON_NAME'),

    /*
    |--------------------------------------------------------------------------
    | Horizon Domain
    |--------------------------------------------------------------------------
    |
    | This is the subdomain where Horizon will be accessible from. If this
    | setting is null, Horizon will reside under the same domain as the
    | application. Otherwise, this value will serve as the subdomain.
    |
    */

    'domain' => env('HORIZON_DOMAIN'),

    /*
    |--------------------------------------------------------------------------
    | Horizon Path
    |--------------------------------------------------------------------------
    |
    | This is the URI path where Horizon will be accessible from. Feel free
    | to change this path to anything you like. Note that the URI will not
    | affect the paths of its internal API that aren't exposed to users.
    |
    */

    'path' => env('HORIZON_PATH', 'horizon'),

    /*
    |--------------------------------------------------------------------------
    | Horizon Redis Connection
    |--------------------------------------------------------------------------
    |
    | This is the name of the Redis connection where Horizon will store the
    | meta information required for it to function. It includes the list
    | of supervisors, failed jobs, job metrics, and other information.
    |
    */

    'use' => 'default',

    /*
    |--------------------------------------------------------------------------
    | Horizon Redis Prefix
    |--------------------------------------------------------------------------
    |
    | This prefix will be used when storing all Horizon data in Redis. You
    | may modify the prefix when you are running multiple installations
    | of Horizon on the same server so that they don't have problems.
    |
    */

    'prefix' => env(
        'HORIZON_PREFIX',
        Str::slug(env('APP_NAME', 'laravel'), '_').'_horizon:'
    ),

    /*
    |--------------------------------------------------------------------------
    | Horizon Route Middleware
    |--------------------------------------------------------------------------
    |
    | These middleware will get attached onto each Horizon route, giving you
    | the chance to add your own middleware to this list or change any of
    | the existing middleware. Or, you can simply stick with this list.
    |
    */

    'middleware' => ['web'],

    /*
    |--------------------------------------------------------------------------
    | Queue Wait Time Thresholds
    |--------------------------------------------------------------------------
    |
    | This option allows you to configure when the LongWaitDetected event
    | will be fired. Every connection / queue combination may have its
    | own, unique threshold (in seconds) before this event is fired.
    |
    */

    'waits' => [
        'redis:critical' => 30,
        'redis:webhooks' => 30,
        'redis:provisioning' => 120,
        'redis:billing' => 120,
        'redis:sync' => 300,
        'redis:notifications' => 60,
        'redis:monitoring' => 60,
        'redis:default' => 300,
    ],

    /*
    |--------------------------------------------------------------------------
    | Job Trimming Times
    |--------------------------------------------------------------------------
    |
    | Here you can configure for how long (in minutes) you desire Horizon to
    | persist the recent and failed jobs. Typically, recent jobs are kept
    | for one hour while all failed jobs are stored for an entire week.
    |
    */

    'trim' => [
        'recent' => 60,
        'pending' => 60,
        'completed' => 60,
        'recent_failed' => 10080,
        'failed' => 10080,
        'monitored' => 10080,
    ],

    /*
    |--------------------------------------------------------------------------
    | Silenced Jobs
    |--------------------------------------------------------------------------
    |
    | Silencing a job will instruct Horizon to not place the job in the list
    | of completed jobs within the Horizon dashboard. This setting may be
    | used to fully remove any noisy jobs from the completed jobs list.
    |
    */

    'silenced' => [
        // App\Jobs\ExampleJob::class,
    ],

    'silenced_tags' => [
        // 'notifications',
    ],

    /*
    |--------------------------------------------------------------------------
    | Metrics
    |--------------------------------------------------------------------------
    |
    | Here you can configure how many snapshots should be kept to display in
    | the metrics graph. This will get used in combination with Horizon's
    | `horizon:snapshot` schedule to define how long to retain metrics.
    |
    */

    'metrics' => [
        'trim_snapshots' => [
            'job' => 24,
            'queue' => 24,
        ],
    ],

    /*
    |--------------------------------------------------------------------------
    | Fast Termination
    |--------------------------------------------------------------------------
    |
    | When this option is enabled, Horizon's "terminate" command will not
    | wait on all of the workers to terminate unless the --wait option
    | is provided. Fast termination can shorten deployment delay by
    | allowing a new instance of Horizon to start while the last
    | instance will continue to terminate each of its workers.
    |
    */

    'fast_termination' => false,

    /*
    |--------------------------------------------------------------------------
    | Memory Limit (MB)
    |--------------------------------------------------------------------------
    |
    | This value describes the maximum amount of memory the Horizon master
    | supervisor may consume before it is terminated and restarted. For
    | configuring these limits on your workers, see the next section.
    |
    */

    'memory_limit' => 64,

    /*
    |--------------------------------------------------------------------------
    | Queue Worker Configuration
    |--------------------------------------------------------------------------
    |
    | Here you may define the queue worker settings used by your application
    | in all environments. These supervisors and settings handle all your
    | queued jobs and will be provisioned by Horizon during deployment.
    |
    */

    /*
    | Colas de docs/00-requerimientos.md §10 (más `webhooks`, ver mapa del
    | sistema §2). Un supervisor por cola para que un atasco en una no frene
    | a las demás. `tries` sigue la tabla de §10; es solo el valor por
    | defecto: cada Job puede fijar $tries / $backoff (p. ej. la espera
    | exponencial de `critical`) en su propia clase.
    |
    | `timeout` debe ser menor que `retry_after` de la conexión redis
    | (config/queue.php, REDIS_QUEUE_RETRY_AFTER, 300 s por defecto).
    |
    | Pendientes (no son decisiones técnicas, no se inventan):
    |  - `webhooks`: docs/00 §10 no fija reintentos; se usa 3 como `default`.
    |  - `reports` (M-DSH) no está en la lista de docs/00; no se procesa aquí
    |    hasta que se decida si se agrega a la lista o se usa `default`.
    */
    'defaults' => [
        'supervisor-critical' => [
            'connection' => 'redis',
            'queue' => ['critical'],
            'balance' => 'simple',
            'maxProcesses' => 2,
            'memory' => 128,
            'tries' => 5,
            'backoff' => 10,
            'timeout' => 60,
            'nice' => 0,
        ],
        'supervisor-webhooks' => [
            'connection' => 'redis',
            'queue' => ['webhooks'],
            'balance' => 'simple',
            'maxProcesses' => 1,
            'memory' => 128,
            'tries' => 3,
            'backoff' => 10,
            'timeout' => 60,
            'nice' => 0,
        ],
        'supervisor-provisioning' => [
            'connection' => 'redis',
            'queue' => ['provisioning'],
            'balance' => 'simple',
            'maxProcesses' => 1,
            'memory' => 128,
            'tries' => 3,           // luego revisión humana (provisioning_runs)
            'backoff' => 30,
            'timeout' => 240,
            'nice' => 0,
        ],
        'supervisor-billing' => [
            'connection' => 'redis',
            'queue' => ['billing'],
            'balance' => 'simple',
            'maxProcesses' => 1,
            'memory' => 128,
            'tries' => 5,
            'backoff' => 30,
            'timeout' => 120,
            'nice' => 0,
        ],
        'supervisor-sync' => [
            'connection' => 'redis',
            'queue' => ['sync'],
            'balance' => 'simple',
            'maxProcesses' => 1,
            'memory' => 128,
            'tries' => 3,
            'backoff' => 60,
            'timeout' => 240,
            'nice' => 0,
        ],
        'supervisor-notifications' => [
            'connection' => 'redis',
            'queue' => ['notifications'],
            'balance' => 'simple',
            'maxProcesses' => 1,
            'memory' => 128,
            'tries' => 5,
            'backoff' => 30,
            'timeout' => 60,
            'nice' => 0,
        ],
        'supervisor-monitoring' => [
            'connection' => 'redis',
            'queue' => ['monitoring'],
            'balance' => 'simple',
            'maxProcesses' => 1,
            'memory' => 128,
            'tries' => 1,
            'timeout' => 60,
            'nice' => 0,
        ],
        'supervisor-default' => [
            'connection' => 'redis',
            'queue' => ['default'],
            'balance' => 'simple',
            'maxProcesses' => 1,
            'memory' => 256,        // exportaciones, PDF, importaciones
            'tries' => 3,
            'backoff' => 30,
            'timeout' => 240,
            'nice' => 0,
        ],
    ],

    'environments' => [
        'production' => [
            'supervisor-critical' => ['maxProcesses' => 4],
            'supervisor-webhooks' => ['maxProcesses' => 2],
            'supervisor-provisioning' => ['maxProcesses' => 3],
            'supervisor-billing' => ['maxProcesses' => 2],
            'supervisor-sync' => ['maxProcesses' => 2],
            'supervisor-notifications' => ['maxProcesses' => 3],
            'supervisor-monitoring' => ['maxProcesses' => 2],
            'supervisor-default' => ['maxProcesses' => 2],
        ],

        'staging' => [
            'supervisor-critical' => ['maxProcesses' => 2],
            'supervisor-webhooks' => ['maxProcesses' => 1],
            'supervisor-provisioning' => ['maxProcesses' => 1],
            'supervisor-billing' => ['maxProcesses' => 1],
            'supervisor-sync' => ['maxProcesses' => 1],
            'supervisor-notifications' => ['maxProcesses' => 1],
            'supervisor-monitoring' => ['maxProcesses' => 1],
            'supervisor-default' => ['maxProcesses' => 1],
        ],

        'local' => [
            'supervisor-critical' => ['maxProcesses' => 1],
            'supervisor-webhooks' => ['maxProcesses' => 1],
            'supervisor-provisioning' => ['maxProcesses' => 1],
            'supervisor-billing' => ['maxProcesses' => 1],
            'supervisor-sync' => ['maxProcesses' => 1],
            'supervisor-notifications' => ['maxProcesses' => 1],
            'supervisor-monitoring' => ['maxProcesses' => 1],
            'supervisor-default' => ['maxProcesses' => 1],
        ],
    ],

    /*
    |--------------------------------------------------------------------------
    | File Watcher Configuration
    |--------------------------------------------------------------------------
    |
    | The following list of directories and files will be watched when using
    | the `horizon:listen` command. Whenever any directories or files are
    | changed, Horizon will automatically restart to apply all changes.
    |
    */

    'watch' => [
        'app',
        'bootstrap',
        'config/**/*.php',
        'database/**/*.php',
        'public/**/*.php',
        'resources/**/*.php',
        'routes',
        'composer.lock',
        'composer.json',
        '.env',
    ],
];
