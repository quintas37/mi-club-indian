const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

// 📁 RUTAS DE ALMACENAMIENTO PERMANENTE INMUNE A FALLAS DE RED
const RUTA_DB_USUARIOS = path.join(__dirname, 'usuarios.json');
const RUTA_DB_VIAJES = path.join(__dirname, 'viajes.json');
const RUTA_DB_RODADAS = path.join(__dirname, 'rodadas.json');

let baseDatosBikers = fs.existsSync(RUTA_DB_USUARIOS) ? JSON.parse(fs.readFileSync(RUTA_DB_USUARIOS, 'utf-8')) : [];
let galeriaViajes = fs.existsSync(RUTA_DB_VIAJES) ? JSON.parse(fs.readFileSync(RUTA_DB_VIAJES, 'utf-8')) : [];
let cronogramaRodadas = fs.existsSync(RUTA_DB_RODADAS) ? JSON.parse(fs.readFileSync(RUTA_DB_RODADAS, 'utf-8')) : [];
let sesionesActivas = {}; 

function guardarEnDiscoD() {
    fs.writeFileSync(RUTA_DB_USUARIOS, JSON.stringify(baseDatosBikers, null, 2), 'utf-8');
    fs.writeFileSync(RUTA_DB_VIAJES, JSON.stringify(galeriaViajes, null, 2), 'utf-8');
    fs.writeFileSync(RUTA_DB_RODADAS, JSON.stringify(cronogramaRodadas, null, 2), 'utf-8');
}

function servirArchivoEstatico(res, urlPath) {
    let filePath = path.join(PUBLIC_DIR, urlPath === '/' ? 'index.html' : urlPath);
    let extname = path.extname(filePath);
    let contentType = 'text/html';
    if (extname === '.css') contentType = 'text/css';
    if (extname === '.js') contentType = 'application/javascript';
    if (extname === '.png') contentType = 'image/png';
    if (extname === '.jpg' || extname === '.jpeg') contentType = 'image/jpeg';
    if (extname === '.mp4') contentType = 'video/mp4';

    fs.readFile(filePath, (err, content) => {
        if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('404 Not Found'); }
        else { res.writeHead(200, { 'Content-Type': contentType }); res.end(content, 'utf-8'); }
    });
}

const server = http.createServer((req, res) => {
    const tokenCliente = req.headers['x-biker-token'];
    const usuarioSesionActiva = sesionesActivas[tokenCliente];
    
    const datosBikerNavegando = usuarioSesionActiva ? baseDatosBikers.find(u => u.id === usuarioSesionActiva.id) : null;
    const esPresidente = datosBikerNavegando && datosBikerNavegando.rango === 'Presidente';
    const esOficialConPoderes = datosBikerNavegando && ['Vicepresidente', 'Sargento de Armas', 'Capitán de Ruta', 'Tesorero'].includes(datosBikerNavegando.rango);
    const tienePermisosModerador = esPresidente || esOficialConPoderes;

    /* ================= API NATIVA: OBTENER TODOS LOS USUARIOS ================= */
    if (req.url === '/api/bikers' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        if (tienePermisosModerador) {
            return res.end(JSON.stringify({ success: true, bikers: baseDatosBikers, modoAdmin: true, soyPresidente: esPresidente, soyOficial: esOficialConPoderes }));
        } else {
            return res.end(JSON.stringify({ success: true, bikers: baseDatosBikers.filter(b => b.aprobado), modoAdmin: false }));
        }
    }

    /* ================= API NATIVA: FEED DE CRÓNICAS MULTIMEDIA ================= */
    if (req.url === '/api/viajes' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true, viajes: galeriaViajes, modoAdmin: tienePermisosModerador, idBikerLogueado: usuarioSesionActiva ? usuarioSesionActiva.id : null }));
    }

    /* ================= API NATIVA: OBTENER CALENDARIO DE RODADAS ================= */
    if (req.url === '/api/rodadas' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        const rodadasMapeadas = cronogramaRodadas.map(r => {
            const listaIds = r.asistentesBikers || [];
            const nombresAsistentes = listaIds.map(id => {
                const b = baseDatosBikers.find(u => u.id === id);
                return b ? b.nombreCompleto : 'Biker';
            });
            return { ...r, nombresAsistentes };
        });
        return res.end(JSON.stringify({ success: true, rodadas: rodadasMapeadas, modoAdmin: tienePermisosModerador, idBikerLogueado: usuarioSesionActiva ? usuarioSesionActiva.id : null }));
    }

    /* ================= API NATIVA: CREAR NUEVA RODADA ================= */
    if (req.url === '/api/rodadas/nueva' && req.method === 'POST') {
        if (!tienePermisosModerador) { res.writeHead(403, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ success: false })); }
        let body = ''; req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            const data = JSON.parse(body);
            cronogramaRodadas.push({
                id: Date.now(), titulo: data.titulo, destino: data.destino, fecha: data.fecha, puntoEncuentro: data.punto, creadoPor: datosBikerNavegando.nombreCompleto,
                asistentesBikers: []
            });
            guardarEnDiscoD();
            res.writeHead(201, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: true }));
        });
        return;
    }

    /* ================= API NATIVA: UNIRSE A LA RODADA (RSVP) ================= */
    if (req.url === '/api/rodadas/unirse' && req.method === 'POST') {
        if (!usuarioSesionActiva) { res.writeHead(401, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ success: false })); }
        let body = ''; req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            const data = JSON.parse(body);
            const rodada = cronogramaRodadas.find(r => r.id === parseInt(data.idRodada));
            if (rodada) {
                if (!rodada.asistentesBikers) rodada.asistentesBikers = [];
                const idx = rodada.asistentesBikers.indexOf(usuarioSesionActiva.id);
                if (idx === -1) { rodada.asistentesBikers.push(usuarioSesionActiva.id); } 
                else { rodada.asistentesBikers.splice(idx, 1); }
                guardarEnDiscoD();
                res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ success: true }));
            }
            res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: false }));
        });
        return;
    }

    /* ================= API NATIVA: REGISTRO DE USUARIOS ================= */
    if (req.url === '/api/auth/registrar' && req.method === 'POST') {
        let body = ''; req.on('data', chunk => { body += chunk.toString('utf8'); });
        req.on('end', () => {
            const data = JSON.parse(body);
            const usuarioLimpio = data.usuario.trim().toLowerCase().replace(/\s+/g, '');
            const correoLimpio = data.correo.trim().toLowerCase();
            const usuarioExiste = baseDatosBikers.some(u => u.usuario === usuarioLimpio || u.correo === correoLimpio);
            if (usuarioExiste) { res.writeHead(400, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ success: false, error: "Ya existe." })); }

            const salt = crypto.randomBytes(16).toString('hex');
            const hash = crypto.scryptSync(data.password, salt, 64).toString('hex');
            const rangoAsignado = baseDatosBikers.length === 0 ? 'Presidente' : 'Miembro de la Tribu';

            baseDatosBikers.push({
                id: Date.now(), usuario: usuarioLimpio, correo: correoLimpio, passwordHash: hash, salt: salt,
                nombreCompleto: data.nombreCompleto.trim(), moto: data.moto || 'Indian Scout', rango: rangoAsignado, aprobado: baseDatosBikers.length === 0
            });
            guardarEnDiscoD();
            res.writeHead(201, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: true }));
        });
        return;
    }

    /* ================= API NATIVA: INICIO DE SESIÓN ================= */
    if (req.url === '/api/auth/login' && req.method === 'POST') {
        let body = ''; req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            const data = JSON.parse(body); const biker = baseDatosBikers.find(u => u.usuario === data.usuario.trim().toLowerCase());
            if (!biker) { res.writeHead(401, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ success: false, error: "No existe." })); }
            if (!biker.aprobado) { res.writeHead(403, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ success: false, error: "En revisión." })); }

            const hashVerificar = crypto.scryptSync(data.password, biker.salt, 64).toString('hex');
            if (hashVerificar !== biker.passwordHash) { res.writeHead(401, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ success: false, error: "Contraseña incorrecta." })); }

            const tokenSesion = crypto.randomBytes(16).toString('hex');
            sesionesActivas[tokenSesion] = { id: biker.id, nombre: biker.nombreCompleto };
            res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: true, token: tokenSesion }));
        });
        return;
    }

    /* ================= API NATIVA: VERIFICAR SESIÓN ================= */
    if (req.url === '/api/auth/estado' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        if (datosBikerNavegando) {
            return res.end(JSON.stringify({ logueado: true, nombre: datosBikerNavegando.nombreCompleto, rango: datosBikerNavegando.rango }));
        } else { return res.end(JSON.stringify({ logueado: false })); }
    }

    /* ================= ACCIONES DE ADMINISTRACIÓN NATIVAS ================= */
    if (req.url === '/api/admin/aprobar' && req.method === 'POST') {
        let body = ''; req.on('data', chunk => { body += chunk.toString(); });
req.on('end', () => {
const data = JSON.parse(body); const biker = baseDatosBikers.find(u => u.usuario === data.usuario);
if (biker) { biker.aprobado = true; guardarEnDiscoD(); }
res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: true }));
}); return;
}
if (req.url === '/api/admin/cambiar-rango' && req.method === 'POST') {
let body = ''; req.on('data', chunk => { body += chunk.toString(); });
req.on('end', () => {
const data = JSON.parse(body); const biker = baseDatosBikers.find(u => u.usuario === data.usuario);
if (biker) { biker.rango = data.nuevoRango; guardarEnDiscoD(); }
res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: true }));
}); return;
}
if (req.url === '/api/admin/baja' && req.method === 'POST') {
let body = ''; req.on('data', chunk => { body += chunk.toString(); });
req.on('end', () => {
const data = JSON.parse(body); baseDatosBikers = baseDatosBikers.filter(u => u.usuario !== data.usuario); guardarEnDiscoD();
res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: true }));
}); return;
}
if (req.url === '/api/admin/borrar-rodada' && req.method === 'POST') {
let body = ''; req.on('data', chunk => { body += chunk.toString(); });
req.on('end', () => {
const data = JSON.parse(body); cronogramaRodadas = cronogramaRodadas.filter(r => r.id !== parseInt(data.idRodada)); guardarEnDiscoD();
res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: true }));
}); return;
}
if (req.url === '/api/admin/borrar-cronica' && req.method === 'POST') {
let body = ''; req.on('data', chunk => { body += chunk.toString(); });
req.on('end', () => {
const data = JSON.parse(body); galeriaViajes = galeriaViajes.filter(v => v.id !== parseInt(data.idViaje)); guardarEnDiscoD();
res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: true }));
}); return;
}
/* ================= API NATIVA: REACCIÓN RIDE UP 👍 ================= */
if (req.url === '/api/viajes/ride-up' && req.method === 'POST') {
if (!usuarioSesionActiva) return res.end(JSON.stringify({ success: false }));
let body = ''; req.on('data', chunk => { body += chunk.toString(); });
req.on('end', () => {
const data = JSON.parse(body); const viaje = galeriaViajes.find(v => v.id === parseInt(data.idViaje));
if (viaje) {
if (!viaje.likesBikers) viaje.likesBikers = [];
const idx = viaje.likesBikers.indexOf(usuarioSesionActiva.id);
if (idx === -1) { viaje.likesBikers.push(usuarioSesionActiva.id); }
else { viaje.likesBikers.splice(idx, 1); }
guardarEnDiscoD();
res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: true }));
}
}); return;
}
/* ================= API NATIVA: SUBIR CRÓNICA (FOTOS Y VIDEOS) ================= */
if (req.url === '/api/viajes/subir' && req.method === 'POST') {
if (!usuarioSesionActiva) { res.writeHead(401, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ success: false })); }
let bodyBuffer = []; req.on('data', chunk => { bodyBuffer.push(chunk); });
req.on('end', () => {
const bufferCompleto = Buffer.concat(bodyBuffer);
const contentTypeHeader = req.headers['content-type'] || ''; const boundaryMatch = contentTypeHeader.match(/boundary=(.+)/);
if (!boundaryMatch) { res.writeHead(400, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ success: false })); }
let boundaryLimpio = boundaryMatch[1].replace(/["']/g, '');
if (!boundaryLimpio.startsWith('--')) boundaryLimpio = '--' + boundaryLimpio;
const boundaryBuffer = Buffer.from(boundaryLimpio);
let posiciones = []; let index = bufferCompleto.indexOf(boundaryBuffer);
while (index !== -1) { posiciones.push(index); index = bufferCompleto.indexOf(boundaryBuffer, index + boundaryBuffer.length); }
let campos = {}; let fotosGuardadas = [];
for (let i = 0; i < posiciones.length - 1; i++) {
const inicio = posiciones[i] + boundaryBuffer.length + 2; const fin = posiciones[i+1]; const parteBuffer = bufferCompleto.subarray(inicio, fin);
const indiceCuerpo = parteBuffer.indexOf('\r\n\r\n'); if (indiceCuerpo === -1) continue;
const cabecera = parteBuffer.subarray(0, indiceCuerpo).toString('utf-8'); const cuerpo = parteBuffer.subarray(indiceCuerpo + 4, parteBuffer.length - 2);
if (cabecera.includes('name="fotoViaje"')) {
if (cabecera.includes('filename=""') || cuerpo.length < 100) continue;
if (cuerpo.length > 15728640) { res.writeHead(400, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ success: false, error: "Excede 15MB." })); }
const esVideo = cabecera.toLowerCase().includes('video/') || cabecera.toLowerCase().includes('.mp4') || cabecera.toLowerCase().includes('.mov');
const extFinal = esVideo ? '.mp4' : '.jpg';
const fotoNombreUnico = 'biker-media-' + Date.now() + '-' + Math.round(Math.random() * 1000) + extFinal;
fs.writeFileSync(path.join(PUBLIC_DIR, 'uploads', 'viajes', fotoNombreUnico), cuerpo);
fotosGuardadas.push('/uploads/viajes/' + fotoNombreUnico);
} else {
const posName = cabecera.indexOf('name="');
if (posName !== -1) { campos[cabecera.substring(posName + 6, cabecera.indexOf('"', posName + 6)).trim()] = cuerpo.toString('utf-8').trim(); }
}
}
if (fotosGuardadas.length === 0) { res.writeHead(400, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ success: false })); }
const dominioActivo = req.headers.host;
galeriaViajes.push({
id: Date.now(), titulo_viaje: campos.titulo || 'Rodada', descripcion: campos.descripcion,
ruta_origen_destino: campos.ruta, urls_fotos: fotosGuardadas.map(f => 'http://' + dominioActivo + f),
nombre_completo: usuarioSesionActiva.nombre, likesBikers: []
});
guardarEnDiscoD();
res.writeHead(201, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: true }));
});
return;
}
servirArchivoEstatico(res, req.url);
});

server.listen(PORT, () => console.log("🏍️ Servidor Indian activo en puerto " + PORT + "\n"));
