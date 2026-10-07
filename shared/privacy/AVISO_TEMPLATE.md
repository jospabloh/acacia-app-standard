# Plantillas de aviso de privacidad — Módulo 28

Estructura, no texto legal. Cada `[…]` es una decisión que alguien toma y
ningún corchete llega a producción. Una persona abogada con cédula en México
revisa el resultado antes de publicarlo.

El aviso lo produce un generador a partir de dos archivos y nadie lo edita a
mano: el **inventario** (`privacy/data-inventory.json`) y un archivo de
**texto fijo**. Cada sección dice de cuál sale. Todo lo que se imprime está
escrito en español en uno de los dos; nunca se imprime un identificador.

Ley de referencia: Ley Federal de Protección de Datos Personales en Posesión
de los Particulares, publicada en el DOF el 20 de marzo de 2025. En el aviso
público se cita la ley por nombre y fecha, sin números de artículo, salvo que
los ponga quien lo revisó.

---

## A. Aviso integral — `acaciaco-site/legal/privacidad/<slug>`

**Aviso de privacidad de [App]**
Versión [`notice_version`] · [fecha en que se publicó esa versión]

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
*Inventario.* Una fila por cada combinación de titular y categoría que tenga
datos, con las etiquetas de los campos. Incluye lo que solo vive en un
`store`. Las siete categorías aparecen cuando aplican; las filas de datos
financieros y sensibles van siempre, aunque digan "ninguno".

| De quién | Categoría | Datos |
|---|---|---|
| [`titulares.label`] | Identificación | [`fields.label`, …] |
| […] | Contacto | […] |
| […] | Financieros o patrimoniales | [ninguno / cuáles] |
| […] | **Sensibles** | [No tratamos datos sensibles / cuáles] |

**Qué no recabamos** *(texto fijo)*: [por ejemplo: no guardamos números de
tarjeta; no tomamos fotografías de identificaciones; no usamos datos
biométricos].

### 4. Para qué los usamos
*Inventario: `purposes.label`, separadas por `requires_consent`.*

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
*Inventario: aparece cuando algún campo tiene categoría `financial`.*
[Los campos financieros, por su etiqueta, y la finalidad necesaria para la
que se usan.] Te pedimos autorizarlo de forma expresa en el formulario donde
los registras; sin esa autorización no podemos darte esa parte del servicio.

El consentimiento tácito no basta para estos datos aunque la finalidad sea
necesaria. El bloque se omite solo si la app no trata datos financieros ni
patrimoniales de personas, o si quien revisó el aviso dejó escrita en el
texto fijo la excepción de ley que aplica.

### 5. Cómo limitar el uso o divulgación de tus datos
[Dónde está el control en la app: Cuenta → Privacidad] o escribiendo a
[correo]. [Qué pasa con cada opción.]

### 6. Quién más interviene
*Inventario: `recipients` con `label`, `does` y `country`, y los datos que
cada uno recibe según los `stores`.*

Proveedores que tratan datos por nuestra cuenta (encargados):
[Base44 — hospeda la app y su base de datos, EE. UU.]; [Mercado Pago — cobra
la suscripción]; [WhatsApp (Meta) — entrega los mensajes: teléfono y nombre];
[…].

Transferencias a terceros que no son encargados: [Ninguna / una línea por
cada destinatario con `role: third_party`: a quién, para qué y qué datos].
- Las que la ley permite sin consentimiento (`legal_basis` con valor) se
  listan diciéndolo.
- Las demás requieren que las aceptes. **Esta página no registra nada:** lo
  decides en el formulario donde das tus datos, y puedes cambiarlo después en
  [Cuenta → Privacidad] o con una solicitud (sección 8).

### 7. Cuánto tiempo los conservamos
*Inventario: `retention` y `deletion` de cada entidad y de cada copia en un
`store`.* [Una línea por grupo de datos y por lugar donde se guardan: en la
app, con cada proveedor. Donde un proveedor conserva una copia que no podemos
eliminar, se dice aquí.] Al terminar el plazo, los datos se bloquean y después
se suprimen.

### 8. Tus derechos ARCO y cómo revocar tu consentimiento
*Texto fijo.* Puedes acceder, rectificar, cancelar u oponerte, y revocar tu consentimiento:
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
*Texto fijo.* [Medidas reales, en lenguaje llano. Las certificaciones SOC 2 e ISO 27001
son de Base44, la plataforma donde opera la app, no de ACACIA.]
Si ocurre una vulneración que afecte de forma significativa tus derechos, te
avisaremos de inmediato por [medio].

### 10. Cookies y tecnologías similares
*Inventario: lo que declaran `browser_storage` y `analytics`. Texto fijo:
cómo desactivarlas.* [Cuáles, para qué, y cómo desactivarlas.]

### 11. Cambios a este aviso
*Texto fijo.* Publicaremos la nueva versión en esta página con su fecha. Si
tienes cuenta, al iniciar sesión te mostraremos qué cambió. Lo que ya habías
aceptado o rechazado se conserva; solo te preguntaremos por lo nuevo.

### 12. Si no quedas conforme
Puedes acudir a la Secretaría Anticorrupción y Buen Gobierno, autoridad en
materia de protección de datos personales en posesión de particulares.

---

## B. Aviso simplificado — junto a cada formulario

Uno por cada punto de recabación que llena el titular o quien lo representa.
*Inventario: lo que ese punto recaba y sus finalidades. Texto fijo: identidad
y domicilio.*

> **[Responsable]**, con domicilio en [domicilio completo], usará tu [datos
> que pide este formulario, por su etiqueta] para [finalidades necesarias de
> este punto]. Puedes limitar su uso en [dónde]. Aviso integral:
> [acaciaco.com.mx/legal/privacidad/<slug>].
>
> ☐ [Una casilla por cada finalidad opcional de este punto: "Quiero recibir
> promociones por WhatsApp".]
> ☐ [Una por cada transferencia a un tercero que requiera aceptación: "Acepto
> que compartan mi nombre con Aseguradora X para cotizarme un seguro".]
> ☐ [Si el formulario pide datos financieros o sensibles: "Autorizo el
> tratamiento de [esos datos] para [finalidad necesaria]".]

Las casillas no se escriben a mano: salen del inventario. Ninguna viene
marcada. Las dos primeras son opcionales y no condicionan el servicio. La
tercera es obligatoria para enviar el formulario que pide esos datos. Cada
respuesta, aceptada o rechazada, queda en el `ConsentRecord`.

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
