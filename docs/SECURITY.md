# 🔒 Guía de Seguridad - Peluquería Cool

## Resumen

Este documento describe las medidas de seguridad implementadas y las mejores prácticas para mantener el proyecto seguro.

---

## 📋 Archivos Sensibles (NO subir a Git)

Los siguientes archivos contienen información sensible y están en `.gitignore`:

| Archivo | Contenido | Riesgo si se expone |
|---------|-----------|---------------------|
| `.env` | Variables de entorno | 🔴 Alto |
| `.env.local` | Variables locales | 🔴 Alto |
| `js/config.js` | Claves de Supabase | 🟡 Medio |
| `execute-sql.ps1` | SERVICE_ROLE_KEY | 🔴 **Crítico** |

### ⚠️ Antes de cada commit

```bash
# Verificar que no hay archivos sensibles
git status

# Si ves js/config.js o .env, NO hagas commit
# Deben aparecer como "untracked" o no aparecer
```

---

## 🔑 Tipos de Claves de Supabase

### 1. ANON_KEY (Clave Anónima)
- **Riesgo**: 🟡 Medio
- **Puede exponerse**: Sí, en el frontend
- **Seguridad**: Depende de las políticas RLS
- **Uso**: Operaciones desde el navegador

### 2. SERVICE_ROLE_KEY (Clave de Servicio)
- **Riesgo**: 🔴 **CRÍTICO**
- **Puede exponerse**: ❌ **NUNCA**
- **Acceso**: Bypass total de RLS
- **Uso**: Solo en backend/servidor

---

## 🛡️ Políticas RLS Implementadas

### Tabla: reservations
```sql
-- Cualquiera puede crear (formulario público)
CREATE POLICY "Anyone can create" FOR INSERT WITH CHECK (true);

-- Solo usuarios autenticados pueden leer/editar
CREATE POLICY "Auth can view" FOR SELECT USING (auth.role() = 'authenticated');
```

### Tabla: admins
```sql
-- Solo usuarios autenticados pueden ver
CREATE POLICY "Auth can view" FOR SELECT USING (auth.role() = 'authenticated');
```

---

## 🔐 Protección contra Ataques

### 1. Fuerza Bruta en Login
- Máximo 5 intentos de login
- Bloqueo de 15 minutos tras exceder
- Implementado en `js/auth.js`

### 2. Acceso al Panel Admin
- Triple-click oculto (sin pistas visuales)
- Verificación de sesión en servidor
- Verificación de rol admin en base de datos

### 3. RLS en Supabase
- Todas las tablas tienen RLS habilitado
- Políticas específicas por operación
- Sin acceso anónimo a datos sensibles

---

## 📦 Configuración para Producción

### Paso 1: Crear `js/config.js`
```bash
# Copiar el template
cp js/config.example.js js/config.js
```

### Paso 2: Editar con tus claves
```javascript
const CONFIG = {
    SUPABASE_URL: 'https://tu-proyecto.supabase.co',
    SUPABASE_ANON_KEY: 'tu-anon-key-aqui',
    // ...
};
```

### Paso 3: Verificar .gitignore
```bash
# js/config.js no debe aparecer como tracked
git status
```

---

## 🚨 Qué hacer si se expone una clave

### Si expusiste ANON_KEY:
1. Revisa las políticas RLS
2. Si RLS está bien configurado, riesgo bajo
3. Opcionalmente, regenera la clave en Supabase

### Si expusiste SERVICE_ROLE_KEY:
1. ⚠️ **INMEDIATAMENTE** regenera la clave en Supabase
2. Revisa logs de acceso en Supabase Dashboard
3. Actualiza todos los lugares donde se usa

---

## ✅ Checklist de Seguridad Pre-Commit

- [ ] `js/config.js` no aparece en `git status`
- [ ] `.env` no aparece en `git status`
- [ ] `execute-sql.ps1` no aparece en `git status`
- [ ] No hay claves hardcodeadas (`eyJ...`)
- [ ] RLS está habilitado en todas las tablas

```bash
# Comando para verificar
grep -r "eyJ" . --include="*.js" --include="*.html" | grep -v node_modules
```

---

## 📞 Contacto de Seguridad

Si encuentras una vulnerabilidad, contacta al desarrollador antes de publicarla.
