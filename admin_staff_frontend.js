// 🔄 CONTROLADORES UNIFICADOS DEL PANEL DE LA MESA DIRECTIVA
document.addEventListener('DOMContentLoaded', () => {
    
    // ================= PESTAÑAS DINÁMICAS (TABS) =================
    const btnTabCronica = document.getElementById('tabCronicaBtn');
    const btnTabRodada = document.getElementById('tabRodadaBtn');
    const seccionCronica = document.getElementById('seccionFormCronica');
    const seccionRodada = document.getElementById('seccionFormRodada');

    btnTabCronica?.addEventListener('click', () => {
        btnTabCronica.classList.add('activo');
        btnTabRodada.classList.remove('activo');
        seccionCronica.style.display = 'block';
        seccionRodada.style.display = 'none';
    });

    btnTabRodada?.addEventListener('click', () => {
        btnTabRodada.classList.add('activo');
        btnTabCronica.classList.remove('activo');
        seccionRodada.style.display = 'block';
        seccionCronica.style.display = 'none';
    });

    // ================= ENVIADOR DE CRÓNICAS Y FOTOS MULTIPART =================
    document.getElementById('formSubirViaje')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const divRes = document.getElementById('resultadoSubida');
        divRes.innerHTML = '⚙️ Subiendo álbum a la cronología de asfalto...';

        const formData = new FormData();
        formData.append('titulo', document.getElementById('viajeTitulo').value);
        formData.append('ruta', document.getElementById('viajeRuta').value);
        formData.append('fecha', document.getElementById('viajeFecha').value);
        formData.append('descripcion', document.getElementById('viajeDescripcion').value);
        
        const inputArchivos = document.getElementById('viajeFoto');
        if (inputArchivos && inputArchivos.files.length > 0) {
            for (let i = 0; i < inputArchivos.files.length; i++) {
                formData.append('fotoViaje', inputArchivos.files[i], inputArchivos.files[i].name);
            }
        }

        try {
            const tokenGuardado = localStorage.getItem('biker_session_token');
            const res = await fetch('/api/viajes/subir', { 
                method: 'POST', 
                headers: { 'x-biker-token': tokenGuardado || '' }, 
                body: formData 
            });
            const data = await res.json();
            
            if (data.success) {
                divRes.innerHTML = '<span style="color:#28a745; font-weight:bold;">✅ ¡Crónica publicada con éxito!</span>';
                document.getElementById('formSubirViaje').reset();
                setTimeout(() => { window.location.href = '/index.html'; }, 1500);
            } else { 
                divRes.innerHTML = `<span style="color:#ff4d4d;">❌ Error: ${data.error}</span>`; 
            }
        } catch (err) {
            divRes.innerHTML = '<span style="color:#ff4d4d;">❌ Error crítico de comunicación con el servidor.</span>';
        }
    });

    // ================= ENVIADOR DE NUEVAS RODADAS AL CALENDARIO =================
    document.getElementById('formNuevaRodada')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const divRes = document.getElementById('resultadoRodada');
        divRes.innerHTML = '⚙️ Añadiendo ruta al cronograma oficial del club...';

        const payload = {
            titulo: document.getElementById('rodadaTitulo').value,
            destino: document.getElementById('rodadaDestino').value,
            fecha: document.getElementById('rodadaFecha').value,
            punto: document.getElementById('rodadaPunto').value
        };

        try {
            const tokenGuardado = localStorage.getItem('biker_session_token');
            const res = await fetch('/api/rodadas/nueva', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'x-biker-token': tokenGuardado || '' 
                },
                body: JSON.stringify(payload)
            });
            const data = await res.json();

            if (data.success) {
                divRes.innerHTML = '<span style="color:#28a745; font-weight:bold;">✅ ¡Rodada agendada con éxito en el calendario!</span>';
                document.getElementById('formNuevaRodada').reset();
                setTimeout(() => { window.location.href = '/index.html#proximas-rodadas'; }, 1500);
            } else {
                divRes.innerHTML = `<span style="color:#ff4d4d;">❌ Error: ${data.error}</span>`;
            }
        } catch (err) {
            divRes.innerHTML = '<span style="color:#ff4d4d;">❌ Error de red con el servidor.</span>';
        }
    });

});

// ================= FUNCIÓN GLOBAL DE SALIDA =================
function cerrarSesion() {
    localStorage.removeItem('biker_session_token');
    window.location.href = '/index.html';
}
