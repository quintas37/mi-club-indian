const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = __dirname;

// 🐘 CONFIGURACIÓN DEL POOL DE CONEXIÓN A POSTGRESQL EN LA NUBE
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

// Comprobar conexión inicial en la consola de Render
pool.query('SELECT NOW()', (err, res) => {
    if (err) console.error('❌ Error crítico con PostgreSQL Cloud:', err.stack);
    else console.log('🐘 Conexión exitosa a la base de datos indian_club en Render.');
});

let sesionesActivas = {};

// ==========================================
// 🏍️ CREACIÓN DEL SERVIDOR ÚNICO NATIVO
// ==========================================
const server = http.createServer(async (req, res) => {
    
    // 🛡️ A) CONTROL DE SESIONES Y ROLES GENERALES (ASÍNCRONO DESDE POSTGRESQL)
    const tokenCliente = req.headers['x-biker-token'];
    const usuarioSesionActiva = sesionesActivas[tokenCliente];
    
    let datosBikerNavegando = null;
    let esPresidente = false;
    let esOficialConPoderes = false;
    let tienePermisosModerador = false;

    if (usuarioSesionActiva) {
        try {
            const userCheck = await pool.query('SELECT * FROM usuarios WHERE id = $1', [usuarioSesionActiva.id]);
            if (userCheck.rows.length > 0) {
                datosBikerNavegando = userCheck.rows[0];
                esPresidente = datosBikerNavegando.rango === 'Presidente';
                esOficialConPoderes = ['Vicepresidente', 'Sargento de Armas', 'Capitán de Ruta', 'Tesorero'].includes(datosBikerNavegando.rango);
                tienePermisosModerador = esPresidente || esOficialConPoderes;
            }
        } catch (err) {
            console.error('Error al validar sesión en BD:', err);
        }
    }

    /* ========================================================================= */
    /* 🌐 RUTA DE SERVICIO DE FRONTEND (PUBLIC) PARA LINUX / RENDER              */
    /* ========================================================================= */
    if (!req.url.startsWith('/api/')) {
        let urlSolicitada = (req.url === '/' || req.url === '') ? 'index.html' : req.url;
        if (urlSolicitada.startsWith('/')) {
            urlSolicitada = urlSolicitada.substring(1);
        }

        if (urlSolicitada === 'app.js' || urlSolicitada.endsWith('.json')) {
            res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' });
            return res.end('<h1>403 Acceso Denegado</h1>');
        }

        let filePath = path.join(PUBLIC_DIR, urlSolicitada);
        let extname = path.extname(filePath);
        let contentType = 'text/html; charset=utf-8';
        if (extname === '.css') contentType = 'text/css';
        if (extname === '.js') contentType = 'text/javascript';
        if (extname === '.png') contentType = 'image/png';
        if (extname === '.jpg' || extname === '.jpeg') contentType = 'image/jpeg';
        if (extname === '.mp4') contentType = 'video/mp4';

        fs.readFile(filePath, (err, content) => {
            if (err) {
                res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end(`<h1>404 Club Indian</h1><p>No encontramos el recurso: <b>${urlSolicitada}</b></p>`);
            } else {
                res.writeHead(200, { 'Content-Type': contentType });
                res.end(content, 'utf-8');
            }
        });
        return;
    }

    /* ========================================================================= */
    /* 🛠️ ENRUTAMIENTO DE LAS APIs EN POSTGRESQL CLOUD                           */
    /* ========================================================================= */

    /* ================= API: OBTENER TODOS LOS USUARIOS ================= */
    if (req.url === '/api/bikers' && req.method === 'GET') {
        try {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            if (tienePermisosModerador) {
                const result = await pool.query('SELECT id, usuario, correo, nombre_completo, moto, rango, aprobado FROM usuarios ORDER BY id DESC');
                return res.end(JSON.stringify({ success: true, bikers: result.rows, modoAdmin: true, soyPresidente: esPresidente, soyOficial: esOficialConPoderes }));
            } else {
                const result = await pool.query('SELECT id, usuario, nombre_completo, moto, rango FROM usuarios WHERE aprobado = true ORDER BY id DESC');
                return res.end(JSON.stringify({ success: true, bikers: result.rows, modoAdmin: false }));
            }
        } catch (err) {
            res.writeHead(500); return res.end(JSON.stringify({ success: false }));
        }
    }

        /* ================= API: FEED DE CRÓNICAS MULTIMEDIA (CORREGIDO) ================= */
    if (req.url === '/api/viajes' && req.method === 'GET') {
        try {
            const result = await pool.query('SELECT * FROM viajes_galeria ORDER BY id DESC');
            
            // 💡 CORRECCIÓN: Se añade charset=utf-8 para evitar errores de texto y asegurar la carga limpia en PC
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            
            return res.end(JSON.stringify({ 
                success: true, 
                viajes: result.rows, 
                modoAdmin: typeof tienePermisosModerador !== 'undefined' ? tienePermisosModerador : false, 
                idBikerLogueado: usuarioSesionActiva ? usuarioSesionActiva.id : null 
            }));
        } catch (err) {
            console.error('❌ Error en el GET de crónicas:', err);
            res.writeHead(500, { 'Content-Type': 'application/json' }); 
            return res.end(JSON.stringify({ success: false, error: 'Error interno al leer la galería.' }));
        }
    }

    /* ================= API: OBTENER CALENDARIO DE RODADAS ================= */
    if (req.url === '/api/rodadas' && req.method === 'GET') {
        try {
            const result = await pool.query('SELECT * FROM rodadas_calendario ORDER BY id DESC');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: true, rodadas: result.rows, modoAdmin: tienePermisosModerador, idBikerLogueado: usuarioSesionActiva ? usuarioSesionActiva.id : null }));
        } catch (err) {
            res.writeHead(500); return res.end(JSON.stringify({ success: false }));
        }
    }

    /* ================= API: CREAR NUEVA RODADA ================= */
    if (req.url === '/api/rodadas/nueva' && req.method === 'POST') {
        if (!tienePermisosModerador) { res.writeHead(403, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ success: false })); }
        let body = ''; req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
            try {
                const data = JSON.parse(body);
                await pool.query(
                    'INSERT INTO rodadas_calendario (titulo, destino, fecha) VALUES ($1, $2, $3)',
                    [data.titulo, data.destino, data.fecha]
                );
                res.writeHead(201, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: true }));
            } catch (err) {
                res.writeHead(500); res.end(JSON.stringify({ success: false }));
            }
        });
        return;
    }

    /* ================= API: REGISTRO DE USUARIOS ================= */
    if (req.url === '/api/auth/registrar' && req.method === 'POST') {
        let body = ''; req.on('data', chunk => { body += chunk.toString('utf8'); });
        req.on('end', async () => {
            try {
                const data = JSON.parse(body);
                const usuarioLimpio = data.usuario.trim().toLowerCase().replace(/\s+/g, '');
                const correoLimpio = data.correo.trim().toLowerCase();
                
                const userCheck = await pool.query('SELECT id FROM usuarios WHERE usuario = $1 OR correo = $2', [usuarioLimpio, correoLimpio]);
                if (userCheck.rows.length > 0) { res.writeHead(400, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ success: false, error: "Ya existe el usuario o correo." })); }
                
                const countCheck = await pool.query('SELECT COUNT(*) FROM usuarios');
                const esPrimerUsuario = parseInt(countCheck.rows[0].count) === 0;
                
                const salt = crypto.randomBytes(16).toString('hex');
                const hash = crypto.scryptSync(data.password, salt, 64).toString('hex');
                const rangoAsignado = esPrimerUsuario ? 'Presidente' : 'Miembro de la Tribu';
                const idUnico = Date.now();

                await pool.query(
                    'INSERT INTO usuarios (id, usuario, correo, password_hash, salt, nombre_completo, moto, rango, aprobado) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
                    [idUnico, usuarioLimpio, correoLimpio, hash, salt, data.nombreCompleto.trim(), data.moto || 'Indian Scout', rangoAsignado, esPrimerUsuario]
                );
                
                res.writeHead(201, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: true }));
            } catch (err) {
                res.writeHead(500); res.end(JSON.stringify({ success: false, error: "Error de servidor." }));
            }
        });
        return;
    }

    /* ================= API: INICIO DE SESIÓN ================= */
    if (req.url === '/api/auth/login' && req.method === 'POST') {
        let body = ''; req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
            try {
                const data = JSON.parse(body);
                const result = await pool.query('SELECT * FROM usuarios WHERE usuario = $1', [data.usuario.trim().toLowerCase()]);
                if (result.rows.length === 0) { res.writeHead(401, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ success: false, error: "No existe el usuario." })); }
                
                const biker = result.rows[0];
if (!biker.aprobado) { res.writeHead(403, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ success: false, error: "Tu cuenta está en revisión por la Mesa Directiva." })); }
const hashVerificar = crypto.scryptSync(data.password, biker.salt, 64).toString('hex');
if (hashVerificar !== biker.password_hash) { res.writeHead(401, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ success: false, error: "Contraseña incorrecta." })); }
const tokenSesion = crypto.randomBytes(16).toString('hex');
sesionesActivas[tokenSesion] = { id: biker.id, nombre: biker.nombre_completo };
res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: true, token: tokenSesion }));
} catch (err) {
res.writeHead(500); res.end(JSON.stringify({ success: false }));
}
});
return;
}
/* ================= API: VERIFICAR SESIÓN ================= */
if (req.url === '/api/auth/estado' && req.method === 'GET') {
res.writeHead(200, { 'Content-Type': 'application/json' });
if (datosBikerNavegando) {
return res.end(JSON.stringify({ logueado: true, nombre: datosBikerNavegando.nombre_completo, rango: datosBikerNavegando.rango }));
} else { return res.end(JSON.stringify({ logueado: false })); }
}
/* ================= ACCIONES DE ADMINISTRACIÓN ================= */
if (req.url === '/api/admin/aprobar' && req.method === 'POST') {
let body = ''; req.on('data', chunk => { body += chunk.toString(); });
req.on('end', async () => {
try {
const data = JSON.parse(body);
await pool.query('UPDATE usuarios SET aprobado = true WHERE usuario = $1', [data.usuario]);
res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: true }));
} catch (err) { res.writeHead(500); res.end(); }
}); return;
}
if (req.url === '/api/admin/cambiar-rango' && req.method === 'POST') {
let body = ''; req.on('data', chunk => { body += chunk.toString(); });
req.on('end', async () => {
try {
const data = JSON.parse(body);
await pool.query('UPDATE usuarios SET rango = $1 WHERE usuario = $2', [data.nuevoRango, data.usuario]);
res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: true }));
} catch (err) { res.writeHead(500); res.end(); }
}); return;
}
if (req.url === '/api/admin/baja' && req.method === 'POST') {
let body = ''; req.on('data', chunk => { body += chunk.toString(); });
req.on('end', async () => {
try {
const data = JSON.parse(body);
await pool.query('DELETE FROM usuarios WHERE usuario = $1', [data.usuario]);
res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: true }));
} catch (err) { res.writeHead(500); res.end(); }
}); return;
}
      /* ================= API: SUBIR CRÓNICA PERMANENTE (SOPORTE MULTI-FOTO LIMPIO) ================= */
if (req.url === '/api/viajes/subir' && req.method === 'POST') {
    if (!usuarioSesionActiva) { 
        res.writeHead(401, { 'Content-Type': 'application/json' }); 
        return res.end(JSON.stringify({ success: false, error: 'Sesión no activa' })); 
    }

    let bodyBuffer = []; 
    req.on('data', chunk => { bodyBuffer.push(chunk); });
    req.on('end', async () => {
        try {
            const bufferCompleto = Buffer.concat(bodyBuffer);
            const contentTypeHeader = req.headers['content-type'] || ''; 
            const boundaryMatch = contentTypeHeader.match(/boundary=(.+)/);
            
            if (!boundaryMatch || !boundaryMatch[1]) { 
                res.writeHead(400, { 'Content-Type': 'application/json' }); 
                return res.end(JSON.stringify({ success: false, error: 'Falta boundary en la petición' })); 
            }
            
            let boundaryLimpio = boundaryMatch[1].replace(/["']/g, '');
            if (!boundaryLimpio.startsWith('--')) boundaryLimpio = '--' + boundaryLimpio;
            const boundaryBuffer = Buffer.from(boundaryLimpio);
            
            let posiciones = []; 
            let index = bufferCompleto.indexOf(boundaryBuffer);
            while (index !== -1) { 
                posiciones.push(index); 
                index = bufferCompleto.indexOf(boundaryBuffer, index + boundaryBuffer.length); 
            }
            
            let campos = {}; 
            let promesasImgbb = [];
            
            for (let i = 0; i < posiciones.length - 1; i++) {
                const inicio = posiciones[i] + boundaryBuffer.length + 2; 
                const fin = posiciones[i+1]; 
                const parteBuffer = bufferCompleto.subarray(inicio, fin);
                const indiceCuerpo = parteBuffer.indexOf('\r\n\r\n'); 
                if (indiceCuerpo === -1) continue;
                
                const cabecera = parteBuffer.subarray(0, indiceCuerpo).toString('utf-8'); 
                const cuerpo = parteBuffer.subarray(indiceCuerpo + 4, parteBuffer.length - 2);
                
                if (cabecera.includes('name="fotoViaje"') || cabecera.includes('filename=')) {
                    if (cabecera.includes('filename=""') || cuerpo.length < 100) continue;
                    
                    const imagenBase64 = cuerpo.toString('base64');
                    const apiKey = process.env.IMGBB_API_KEY || 'AQUÍ_TU_LLAVE_REAL_DE_IMGBB';
                    const urlImgbbApi = 'https://imgbb.com' + apiKey;
                    
                    const formularioFormData = new URLSearchParams();
                    formularioFormData.append('image', imagenBase64);

                    promesasImgbb.push(
                        fetch(urlImgbbApi, {
                            method: 'POST',
                            body: formularioFormData,
                            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
                        }).then(r => r.json())
                    );
                } else {
                    const posName = cabecera.indexOf('name="');
                    if (posName !== -1) { 
                        campos[cabecera.substring(posName + 6, cabecera.indexOf('"', posName + 6)).trim()] = cuerpo.toString('utf-8').trim(); 
                    }
                }
            }
            
            if (promesasImgbb.length === 0) { 
                res.writeHead(400, { 'Content-Type': 'application/json' }); 
                return res.end(JSON.stringify({ success: false, error: 'No se recibieron imágenes válidas.' })); 
            }
            
            const respuestasCompletas = await Promise.all(promesasImgbb);
            let urlsImgbb = [];
            
            for (const resultadoJson of respuestasCompletas) {
                if (resultadoJson && resultadoJson.success && resultadoJson.data) {
                    urlsImgbb.push(resultadoJson.data.url); 
                } else {
                    console.error('Fallo parcial en ImgBB:', resultadoJson);
                }
            }
            
            if (urlsImgbb.length === 0) {
                throw new Error('Ninguna imagen pudo ser cargada con éxito en ImgBB.');
            }
            
            await pool.query(
                'INSERT INTO viajes_galeria (id, titulo_viaje, descripcion, ruta_origen_destino, urls_fotos, nombre_completo) VALUES ($1, $2, $3, $4, $5, $6)',
                [Date.now(), campos.titulo || 'Rodada', campos.descripcion || '', campos.ruta || '', urlsImgbb, usuarioSesionActiva.nombre]
            );
            
            res.writeHead(201, { 'Content-Type': 'application/json; charset=utf-8' }); 
            res.end(JSON.stringify({ success: true, message: '¡Crónica y fotografías publicadas con éxito!' }));
        } catch (err) {
            console.error('❌ Error crítico en el proceso de subida:', err.message);
            res.writeHead(500, { 'Content-Type': 'application/json' }); 
            res.end(JSON.stringify({ success: false, detalle: err.message }));
        }
    });
    return;
}

server.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});
