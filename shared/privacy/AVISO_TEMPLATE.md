# Plantillas de aviso de privacidad — Módulo 28

Estructura, no texto legal. Cada `[…]` es una decisión que alguien toma y
ningún corchete llega a producción. Una persona abogada con cédula en México
revisa el resultado antes de publicarlo.

Ley de referencia: Ley Federal de Protección de Datos Personales en Posesión
de los Particulares, publicada en el DOF el 20 de marzo de 2025. En el aviso
público se cita la ley por nombre y fecha, sin números de artículo, salvo que
los ponga quien lo revisó.

---

## A. Aviso integral — `acaciaco-site/legal/privacidad/<slug>`

**Aviso de privacidad de [App]**
Versión [AAAA-MM-DD] · Última actualización: [fecha]

### 1. Quién es responsable de tus datos
[Razón social o nombre completo del responsable], con domicilio en [calle,
número, colonia, municipio, estado, C.P.]. Persona o departamento de datos
personales: [nombre o área] · [correo].

### 2. Cuándo ACACIA no es el responsable
Si usas [App] porque una empresa u organización te registró o te pidió tus
datos (por ejemplo, eres su cliente, empleado o visitante), esa organización
es la responsable de tus datos y ACACIA los trata por encargo suyo. Su aviso
de privacidad es el que aplica; pídeselo a ella o consúltalo en [dónde lo
publica el tenant dentro de la app].

### 3. Qué datos tratamos
[Generado del inventario: una fila por categoría.]

| Categoría | Datos | De quién |
|---|---|---|
| Identificación | [nombre…] | [titular de la cuenta] |
| Contacto | [correo, teléfono…] | […] |
| Financieros o patrimoniales | [ninguno / cuáles] | […] |
| **Sensibles** | [No tratamos datos sensibles / cuáles y para qué] | […] |

**Qué no recabamos:** [por ejemplo: no guardamos números de tarjeta; no
tomamos fotografías de identificaciones; no usamos datos biométricos].

### 4. Para qué los usamos
**Finalidades necesarias para darte el servicio** (no requieren tu
consentimiento):
- [crear y administrar tu cuenta]
- [facturación y cobro]
- [soporte]

**Finalidades que sí requieren tu consentimiento** (puedes negarte y seguir
usando el servicio):
- [avisos de novedades y promociones]
- […]

**Datos financieros o patrimoniales — requieren tu consentimiento expreso.**
[Qué datos financieros o patrimoniales trata la app y para qué: por ejemplo,
los movimientos y saldos que registras, o los datos de pago de tu
suscripción.]
☐ Sí, autorizo que [Responsable] trate estos datos para [finalidad].

Esta casilla nunca viene marcada, se muestra en el punto donde se recaban
esos datos y deja un `ConsentRecord`. El consentimiento tácito no basta para
ellos, aunque la finalidad sea necesaria para el servicio. El bloque se omite
solo en dos casos, y el PR dice cuál: la app no trata datos financieros ni
patrimoniales de personas, o quien revisó el aviso documentó por escrito que
aplica una excepción de ley (arts. 9 o 36).

### 5. Cómo limitar el uso o divulgación de tus datos
[Dónde está el control en la app: Cuenta → Privacidad] o escribiendo a
[correo]. [Qué pasa con cada opción.]

### 6. Quién más interviene
Proveedores que tratan datos por nuestra cuenta (encargados):
[Base44 — hospedaje y base de datos, país]; [Mercado Pago — cobros];
[proveedor de correo]; [Meta/WhatsApp — mensajes]; [proveedor de IA — qué
función y qué datos recibe].

Transferencias a terceros que no son encargados: [Ninguna / a quién y para
qué — una línea por cada destinatario con `role: third_party` en el
inventario]. Por cada una con `requires_acceptance: true`:
☐ Acepto ☐ No acepto esta transferencia. La respuesta queda en el
`ConsentRecord`. Las que tienen `legal_basis` se listan sin casilla,
indicando que la ley permite hacerlas sin consentimiento.

### 7. Cuánto tiempo los conservamos
[Por categoría: plazo y motivo. Qué se conserva por obligación fiscal u otra
ley, y por cuánto tiempo.] Al terminar el plazo, los datos se bloquean y
después se suprimen.

### 8. Tus derechos ARCO y cómo revocar tu consentimiento
Puedes acceder, rectificar, cancelar u oponerte, y revocar tu consentimiento:
- **En la app:** [Cuenta → Mis datos: exportar, corregir, solicitar baja,
  preferencias].
- **Por solicitud:** [formulario o correo]. Indica tu nombre, un medio para
  responderte, qué derecho quieres ejercer y sobre qué datos, y acredita tu
  identidad con [qué documento].
- Atiende tu solicitud: [persona o departamento de datos personales].
- Recibirás un acuse con número de folio. Te responderemos en un máximo de
  20 días hábiles y, si procede, lo haremos efectivo dentro de los 15 días
  hábiles siguientes. Te avisaremos cuando quede hecho.
- Es gratuito. [Costos de reproducción o envío, si aplican.]

### 9. Seguridad
[Medidas reales, en lenguaje llano. Las certificaciones SOC 2 e ISO 27001
son de Base44, la plataforma donde opera la app, no de ACACIA.]
Si ocurre una vulneración que afecte de forma significativa tus derechos, te
avisaremos de inmediato por [medio].

### 10. Cookies y tecnologías similares
[Cuáles, para qué, y cómo desactivarlas.]

### 11. Cambios a este aviso
Publicaremos la nueva versión en esta página con su fecha. Si el cambio agrega
una finalidad, un destinatario o un tipo de dato, [te lo mostraremos al
iniciar sesión].

### 12. Si no quedas conforme
Puedes acudir a la Secretaría Anticorrupción y Buen Gobierno, autoridad en
materia de protección de datos personales en posesión de particulares.

---

## B. Aviso simplificado — junto a cada formulario

> **[Responsable]**, con domicilio en [domicilio completo], usará tu [datos
> que pide este formulario] para [finalidad necesaria]. [Si aplica: Con tu
> permiso, también para [finalidad que requiere consentimiento].
> ☐ Sí, acepto.] [Si el formulario pide datos financieros o patrimoniales:
> ☐ Autorizo el tratamiento de mis datos financieros para [finalidad].]
> Puedes limitar su uso en [dónde]. Aviso integral:
> [acaciaco.com.mx/legal/privacidad/<slug>].

Ninguna casilla viene marcada. La de datos financieros es obligatoria para
enviar el formulario que los pide; la de una finalidad opcional no lo es.

---

## C. Para el tenant — aviso propio

Cuando el tenant recaba datos de sus propias personas a través de la app
(clientes, visitantes, socios), el responsable es el tenant y el aviso es
suyo. La app no deja ese punto de recabación sin aviso completo:

- La app **genera** el aviso del tenant en sus dos formas (A y B de este
  archivo) a partir del inventario —qué datos pide ese formulario y para
  qué— y de los datos del tenant: nombre o razón social, domicilio completo
  y contacto de privacidad.
- Esos tres datos son obligatorios en la configuración del tenant. **Mientras
  falten, el formulario público no se publica.**
- El formulario muestra el aviso simplificado (identidad y domicilio, datos
  que se piden, finalidades separando las que requieren consentimiento, cómo
  limitar su uso) y el enlace al aviso integral del tenant.
- El tenant puede sustituir el texto generado por el suyo. No puede quitarlo.
