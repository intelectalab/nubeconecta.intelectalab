Hola {{ $recipientName }},

@if ($kind === 'invitation')
Te dieron acceso al portal de clientes de {{ $brand }}. Crea tu contraseña para activar tu cuenta:
@else
Recibimos una solicitud para restablecer la contraseña de tu cuenta del portal de {{ $brand }}. Crea una nueva aquí:
@endif

{{ $url }}

El enlace es de un solo uso y vence en {{ $expiresIn }}.
@if ($kind === 'invitation')
Si no esperabas esta invitación, ignora este correo.
@else
Si no lo solicitaste, ignora este correo: tu contraseña actual sigue igual.
@endif
Nunca te pediremos tu contraseña por correo.

{{ $brand }}
