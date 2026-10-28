<!doctype html>
<html lang="es">
<body style="margin:0;padding:24px;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#1f2933">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:8px;padding:32px">
      <tr><td style="font-size:20px;font-weight:bold;color:#5f9a32;padding-bottom:16px">{{ $brand }}</td></tr>
      <tr><td style="font-size:15px;line-height:1.6">
        <p>Hola {{ $recipientName }},</p>
        @if ($kind === 'invitation')
          <p>Te dieron acceso al portal de clientes de {{ $brand }}. Para activar tu cuenta, crea tu contraseña con el siguiente botón.</p>
        @else
          <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta del portal de {{ $brand }}.</p>
        @endif
        <p style="margin:24px 0"><a href="{{ $url }}" style="background:#5f9a32;color:#fff;text-decoration:none;padding:12px 22px;border-radius:6px;display:inline-block;font-weight:bold">{{ $kind === 'invitation' ? 'Activar mi cuenta' : 'Crear una contraseña nueva' }}</a></p>
        <p>El enlace es de un solo uso y vence en {{ $expiresIn }}. Si el botón no funciona, copia esta dirección en tu navegador:<br><span style="word-break:break-all;color:#52606d">{{ $url }}</span></p>
        <p style="color:#52606d;font-size:13px">
          @if ($kind === 'invitation')
            Si no esperabas esta invitación, ignora este correo: no se creará ninguna contraseña.
          @else
            Si no lo solicitaste, ignora este correo: tu contraseña actual sigue igual.
          @endif
          Nunca te pediremos tu contraseña por correo.
        </p>
      </td></tr>
    </table>
  </td></tr></table>
</body>
</html>
