document.addEventListener('DOMContentLoaded', () => {
    const tokenGuardado = localStorage.getItem('biker_session_token');

    async function verificarMenuNavegacion() {
        try {
            if (!tokenGuardado) {
                const menu = document.getElementById('navMenu');
                if (menu) menu.innerHTML = '<a href="#" id="enlaceTribuNav">La Tribu</a><a href="#proximas-rodadas">Rodadas</a><a href="#viajes">Crónicas</a><a href="/login.html" class="btn-ingresar">Ingresar</a>';
                configurarSidebarFlotante(); return;
            }
            const res = await fetch('/api/auth/estado', { method: 'GET', headers: { 'x-biker-token': tokenGuardado } });
            const estado = await res.json(); const navMenu = document.getElementById('navMenu');

            if (navMenu && estado && estado.logueado) {
                const nombreLimpio = estado.nombre ? estado.nombre.split(' ') : 'Biker';
                navMenu.innerHTML = '<span style="font-size:0.8rem; color:#aaa; font-weight:600; text-transform:uppercase;">' + estado.rango + ': ' + nombreLimpio + ' 🏍️</span>' +
                    '<a href="#" id="enlaceTribuNav">La Tribu</a><a href="#proximas-rodadas">Rodadas</a><a href="#viajes">Crónicas</a>' +
                    '<a href="/admin_staff.html" class="btn-ingresar" style="background-color: var(--color-principal);">📸 Compartir Rodada</a>' +
                    '<a href="#" id="btnCerrarSesionNav" style="font-size:0.8rem; color:#ff4d4d; font-weight:600; text-decoration:none; margin-left:10px;">Salir</a>';

                document.getElementById('btnCerrarSesionNav')?.addEventListener('click', () => { localStorage.removeItem('biker_session_token'); window.location.reload(); });
            }
            configurarSidebarFlotante();
        } catch (err) { console.error(err); }
    }

    async function cargarCalendario() {
        try {
            const res = await fetch('/api/rodadas', { method: 'GET', headers: { 'x-biker-token': tokenGuardado || '' } });
            const data = await res.json(); const contenedor = document.getElementById('contenedorCalendario');
            if (!contenedor) return;

            if (!data.rodadas || data.rodadas.length === 0) {
                contenedor.innerHTML = '<p style="color:#666; font-size:13px; grid-column:1/-1;">No hay rodadas agendadas por el momento.</p>';
                return;
            }

            contenedor.innerHTML = data.rodadas.map(r => {
                const botonBorrarRodada = data.modoAdmin ? '<button class="btn-borrar-rodada" data-id="' + r.id + '" style="margin-left:10px; background:#4a0d12; color:#ff9ca6; border:1px solid #731922; padding:5px 10px; font-size:11px; border-radius:4px; cursor:pointer;">🗑️ Cancelar</button>' : '';
                const listaIds = r.asistentesBikers || [];
                const yaInscrito = data.idBikerLogueado && listaIds.includes(data.idBikerLogueado);
                const textoBoton = yaInscrito ? '✓ ¡Listo para Rodar!' : '🏍️ Unirme a la Rodada';
                const claseBotonInscrito = yaInscrito ? 'inscrito' : '';
                const nombresArray = r.nombresAsistentes || [];
                const asistentesHtml = nombresArray.map(nom => '<span class="biker-badge-salida">👤 ' + nom + '</span>').join('');

                return '<div class="tarjeta-rodada">' +
                    '<span class="fecha-badge-rodada">📅 ' + r.fecha + '</span>' +
                    '<h3 style="font-family:var(--fuente-marca); font-size:1.15rem; color:var(--color-crema); margin-bottom:8px;">' + r.titulo + '</h3>' +
                    '<p style="font-size:0.85rem; color:#ccc; margin-bottom:5px;">📍 <strong>Destino:</strong> ' + r.destino + '</p>' +
                    '<p style="font-size:0.85rem; color:#888;">🚩 <strong>Encuentro:</strong> ' + r.puntoEncuentro + '</p>' +
                    '<small style="font-size:11px; color:#555; display:block; margin-top:5px; margin-bottom:10px;">Organiza: ' + r.creadoPor + '</small>' +
                    '<button class="btn-unirse-rodada ' + claseBotonInscrito + '" data-id="' + r.id + '">' + textoBoton + '</button>' +
                    botonBorrarRodada +
                    '<div class="lista-asistentes-box">' +
                        '<strong>Confirmados (' + listaIds.length + '):</strong><br>' +
                        (listaIds.length === 0 ? '<span style="font-size:11px; color:#555;">Nadie se ha apuntado aún.</span>' : asistentesHtml) +
                    '</div>' +
                '</div>';
            }).join('');

            vincularEventosAsistencia();
            if (data.modoAdmin) vincularEventosRodadas();
        } catch (err) { console.error(err); }
    }

    function vincularEventosAsistencia() {
        document.querySelectorAll('.btn-unirse-rodada').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!tokenGuardado) { alert('Debes ingresar a la Tribu para anotarte.'); return; }
                await fetch('/api/rodadas/unirse', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-biker-token': tokenGuardado }, body: JSON.stringify({ idRodada: btn.getAttribute('data-id') }) });
                window.location.reload();
            });
        });
    }

    function vincularEventosRodadas() {
        document.querySelectorAll('.btn-borrar-rodada').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (confirm('¿Eliminar?')) {
                    await fetch('/api/admin/borrar-rodada', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-biker-token': tokenGuardado }, body: JSON.stringify({ idRodada: btn.getAttribute('data-id') }) });
                    window.location.reload();
                }
            });
        });
    }

    async function cargarGalerias() {
        try {
            const res = await fetch('/api/viajes', { method: 'GET', headers: { 'x-biker-token': tokenGuardado || '' } });
            const data = await res.json(); const contenedor = document.getElementById('contenedorViajes');
            if(!contenedor) return;

            if (!data.viajes || data.viajes.length === 0) {
                contenedor.innerHTML = '<p style="color:#666; grid-column:1/-1; text-align:center; padding: 40px 0;">Aún no hay crónicas guardadas.</p>'; return;
            }

            contenedor.innerHTML = data.viajes.map((v, idx) => {

            // 🚀 Convertir de forma segura los datos de PostgreSQL a un arreglo limpio
        let fotosArray = [];
        if (v.urls_fotos) {
            if (Array.isArray(v.urls_fotos)) {
                fotosArray = v.urls_fotos;
            } else if (typeof v.urls_fotos === 'string') {
                fotosArray = v.urls_fotos.replace(/[{}"']/g, '').split(',').filter(url => url.trim() !== '');
            }
        }
        const totalFotos = fotosArray.length;  
                
                    // 🛠️ DETECTOR MULTIMEDIA OPTIMIZADO: Asegura la visibilidad del primer elemento (índice 0)
        const fotosHtml = fotosArray.map((url, index) => {
            // Limpiar comillas o llaves raras si PostgreSQL las devuelve como texto
            const urlLimpia = url.replace(/[{}"']/g, '').trim();
            const claseActive = index === 0 ? ' active' : '';

            if (urlLimpia.toLowerCase().endsWith('.mp4')) {
                return '<video src="' + urlLimpia + '" class="video-carrusel-item' + claseActive + '" controls></video>';
            } else {
                return '<img src="' + urlLimpia + '" class="foto-carrusel-item' + claseActive + '" alt="Foto">';
            }
        }).join('');


                const botonBorrar = data.modoAdmin ? '<button class="btn-borrar-cronica" data-id="' + v.id + '">🗑️ Eliminar</button>' : '';
                const listaLikes = v.likesBikers || [];
                const yaLeDioLike = data.idBikerLogueado && listaLikes.includes(data.idBikerLogueado);
                const claseLikeActivo = yaLeDioLike ? 'reaccionado' : '';
                const textoMapeado = (v.titulo_viaje + ' ' + v.ruta_origen_destino + ' ' + v.nombre_completo).toLowerCase();

                let cardHtml = '<article class="tarjeta-viaje" data-search="' + textoMapeado + '">' +
                    '<div class="tarjeta-viaje-cuerpo-visual">' +
                        '<div class="contador-fotos-flotante" id="badge-' + idx + '">1 / ' + totalFotos + '</div>' +
                        '<div class="contenedor-foto-carrusel" data-index="' + idx + '" data-total="' + totalFotos + '">' + fotosHtml + '</div>' +
                    '</div>' +
                    '<div class="viaje-detalles">' +
                        '<h3>' + v.titulo_viaje + '</h3>' +
                        '<p>' + v.descripcion + '</p>' +
                        '<div class="meta-inferior">' +
                            '<span class="badge-ruta">📍 ' + v.ruta_origen_destino + '</span>' +
                            '<span class="autor-info">Por: <strong>' + v.nombre_completo + '</strong></span>' +
                        '</div>' +
                        '<button class="btn-ride-up ' + claseLikeActivo + '" data-id="' + v.id + '"> Ride Up 👍 <span class="contador-likes-span">' + listaLikes.length + '</span></button>' +
                        botonBorrar +
                    '</div>' +
                '</article>';
                return cardHtml;
            }).join('');

            inicializarContadoresScroll();
            vincularEventosRideUp();
            configurarFiltroBuscador();
            if (data.modoAdmin) vincularEventosCronicas();
        } catch (err) { console.error(err); }
    }

    function configurarFiltroBuscador() {
        const input = document.getElementById('buscadorInput');
        input?.addEventListener('input', () => {
            const consulta = input.value.toLowerCase().trim();
            document.querySelectorAll('.tarjeta-viaje').forEach(tarjeta => {
                const contenidoBuscar = tarjeta.getAttribute('data-search') || '';
                tarjeta.style.display = contenidoBuscar.includes(consulta) ? 'flex' : 'none';
                    });
            });
    }
    function vincularEventosRideUp() {
        document.querySelectorAll('.btn-ride-up').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (!tokenGuardado) { alert('Debes ingresar.'); return; }
            await fetch('/api/viajes/ride-up', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-biker-token': tokenGuardado }, body: JSON.stringify({ idViaje: btn.getAttribute('data-id') }) });
            window.location.reload();
            });
        });
    }
    function vincularEventosCronicas() {
        document.querySelectorAll('.btn-borrar-cronica').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (confirm('¿Eliminar?')) {
            await fetch('/api/admin/borrar-cronica', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-biker-token': tokenGuardado }, body: JSON.stringify({ idViaje: btn.getAttribute('data-id') }) });
            window.location.reload();
            }
         });
        });
    }
    function vincularEventosAdministrativos() {
        document.querySelectorAll('.btn-admin-aprobar').forEach(btn => {
        btn.addEventListener('click', async () => {
        await fetch('/api/admin/aprobar', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-biker-token': tokenGuardado }, body: JSON.stringify({ usuario: btn.getAttribute('data-user') }) });
        window.location.reload();
           });
        });
        document.querySelectorAll('.selector-rango-biker').forEach(select => {
        select.addEventListener('change', async () => {
        const res = await fetch('/api/admin/cambiar-rango', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-biker-token': tokenGuardado }, body: JSON.stringify({ usuario: select.getAttribute('data-user'), nuevoRango: select.value }) });
        window.location.reload();
         });
        });
    document.querySelectorAll('.btn-admin-baja').forEach(btn => {
        btn.addEventListener('click', async () => {
    if (confirm('¿Dar de baja?')) {
        await fetch('/api/admin/baja', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-biker-token': tokenGuardado }, body: JSON.stringify({ usuario: btn.getAttribute('data-user') }) });
        window.location.reload();
             }
            });
        });
    }
    function inicializarContadoresScroll() {
        document.querySelectorAll('.contenedor-foto-carrusel').forEach(carrusel => {
        carrusel.addEventListener('scroll', () => {
        const idIndex = carrusel.getAttribute('data-index'); const total = carrusel.getAttribute('data-total');
        const badge = document.getElementById('badge-' + idIndex); if (!badge) return;
        const anchoImagen = carrusel.clientWidth; const fotoActual = Math.floor((carrusel.scrollLeft + (anchoImagen / 2)) / anchoImagen) + 1;
        badge.innerText = fotoActual + ' / ' + total;
         });
        });
    }

    // 👥 2. CARGAR MIEMBROS ORDENADOS EN EL SIDEBAR (REPARADO DE BLOQUES)
    async function cargarBikers() {
        try {
            const res = await fetch('/api/bikers', {
                method: 'GET',
                headers: { 'x-biker-token': tokenGuardado || '' }
            });
            const data = await res.json();
            
            const divPresi = document.getElementById('listaPresidente');
            const divOficiales = document.getElementById('listaOficiales');
            const divMiembros = document.getElementById('listaMiembros');
            const divPendientes = document.getElementById('listaPendientes');
            const tituloPendientes = document.getElementById('tituloPendientes');

            if (!divPresi) return;

            // Limpieza absoluta de contenedores antes de renderizar
            divPresi.innerHTML = ''; 
            divOficiales.innerHTML = ''; 
            divMiembros.innerHTML = ''; 
            divPendientes.innerHTML = '';
            if (tituloPendientes) tituloPendientes.style.display = 'none';

            if (!data.bikers || data.bikers.length === 0) {
                divMiembros.innerHTML = '<p style="color:#666; font-size:12px; text-align:center; padding: 10px 0;">No hay miembros registrados.</p>';
                return;
            }

            data.bikers.forEach(b => {
                let botonesAdmin = '';
                
                // Si está activo el modo de administración (para Presidente y Oficiales)
                if (data.modoAdmin && b.rango !== 'Presidente') {
                    let selectorRangos = '';
                    if (data.soyPresidente) {
                        selectorRangos += '<select class="selector-rango-biker" data-user="' + b.usuario + '" style="background:#0e0406; color:#f5ebe6; border:1px solid #5c1f24; padding:5px; font-size:11px; border-radius:4px; margin-top:8px; width:95%;">';
                        selectorRangos += '  <option value="Miembro de la Tribu" ' + (b.rango === 'Miembro de la Tribu' ? 'selected' : '') + '>Miembro Común</option>';
                        selectorRangos += '  <option value="Vicepresidente" ' + (b.rango === 'Vicepresidente' ? 'selected' : '') + '>Vicepresidente ⚡</option>';
                        selectorRangos += '  <option value="Sargento de Armas" ' + (b.rango === 'Sargento de Armas' ? 'selected' : '') + '>Sargento de Armas ⚡</option>';
                        selectorRangos += '  <option value="Capitán de Ruta" ' + (b.rango === 'Capitán de Ruta' ? 'selected' : '') + '>Capitán de Ruta ⚡</option>';
                        selectorRangos += '  <option value="Tesorero" ' + (b.rango === 'Tesorero' ? 'selected' : '') + '>Tesorero ⚡</option>';
                        selectorRangos += '</select>';
                    }

                    botonesAdmin += '<div class="panel-controles-admin" style="margin-top:8px; display:flex; gap:5px; justify-content:flex-start;">';
                    if (!b.aprobado) {
                        botonesAdmin += '  <button class="btn-admin-aprobar" data-user="' + b.usuario + '">✓ Aprobar</button>';
                    }
                    botonesAdmin += '  <button class="btn-admin-baja" data-user="' + b.usuario + '">✕ Baja</button>';
                    botonesAdmin += '</div>';
                    botonesAdmin += selectorRangos;
                }

                // 🛠️ RECONSTRUCCIÓN DE CONTENEDORES COMPACTOS DIV
                let itemHtml = '';
                itemHtml += '<div class="item-biker-compacto" style="opacity: ' + (b.aprobado ? '1' : '0.6') + '; margin-bottom: 12px; padding: 12px; border-radius: 6px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); display: flex; flex-direction: column;">';
                itemHtml += '  <h4 style="margin:0 0 5px 0; color:#fff; font-size:0.95rem; font-weight:600;">' + b.nombreCompleto + '</h4>';
                itemHtml += '  <div class="sub-info" style="font-size:0.8rem; color:#888;">Rango: <span style="color:#ff859a; font-weight:600;">' + b.rango + '</span></div>';
                itemHtml += '  <div class="sub-info" style="font-size:0.8rem; color:#888;">Moto: <strong style="color:#f5ebe6;">' + b.moto + '</strong></div>';
                itemHtml += '  ' + botonesAdmin;
                itemHtml += '</div>';

                // Clasificación en los títulos correspondientes del Sidebar
                if (!b.aprobado) {
                    if (tituloPendientes) tituloPendientes.style.display = 'block';
                    divPendientes.innerHTML += itemHtml;
                } else if (b.rango === 'Presidente') {
                    divPresi.innerHTML += itemHtml;
                } else if (['Vicepresidente', 'Sargento de Armas', 'Capitán de Ruta', 'Tesorero'].includes(b.rango)) {
                    divOficiales.innerHTML += itemHtml;
                } else {
                    divMiembros.innerHTML += itemHtml;
                }
            });

            if (data.modoAdmin) vincularEventosAdministrativos();
        } catch (err) {
            console.error('Error al ordenar la tribu:', err);
        }
    }


function configurarSidebarFlotante() {
document.querySelectorAll('#enlaceTribuNav').forEach(e => e.addEventListener('click', () => { document.getElementById('tribuSidebar')?.classList.add('activo'); document.getElementById('tribuOverlay')?.classList.add('activo'); }));
document.getElementById('cerrarTribuBtn')?.addEventListener('click', () => { document.getElementById('tribuSidebar')?.classList.remove('activo'); document.getElementById('tribuOverlay')?.classList.remove('activo'); });
}
function configurarMenuMovil() {
const boton = document.getElementById('menuBoton');
const menu = document.getElementById('navMenu');
if (boton && menu) {
boton.addEventListener('click', (e) => { e.stopPropagation(); boton.classList.toggle('abierto'); menu.classList.toggle('activo'); });
}
}
async function inicializarPortal() {
await verificarMenuNavegacion();
await cargarCalendario();
await cargarBikers();
await cargarGalerias();
configurarMenuMovil();
}
inicializarPortal();
});

