document.addEventListener('DOMContentLoaded', () => {
    const tabLogin = document.getElementById('tabLoginBtn');
    const tabRegistro = document.getElementById('tabRegistroBtn');
    const formLogin = document.getElementById('formLogin');
    const formRegistro = document.getElementById('formRegistro');
    const divAlerta = document.getElementById('authAlertas');

    tabLogin?.addEventListener('click', () => {
        tabLogin.classList.add('activo'); tabRegistro.classList.remove('activo');
        formLogin.style.display = 'block'; formRegistro.style.display = 'none';
    });
    tabRegistro?.addEventListener('click', () => {
        tabRegistro.classList.add('activo'); tabLogin.classList.remove('activo');
        formRegistro.style.display = 'block'; formLogin.style.display = 'none';
    });

            formLogin?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const payload = { usuario: document.getElementById('loginUsuario').value, password: document.getElementById('loginPassword').value };
        
        const res = await fetch('/api/auth/login', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
        const data = await res.json();
        
        if(data.success) { 
            // 💾 GUARDADO SEGURO EN CHROME: Almacenamos el identificador localmente
            localStorage.setItem('biker_session_token', data.token);
            window.location.href = '/index.html'; 
        } 
        else { divAlerta.innerHTML = `<span style="color:#ff4d4d;">❌ ${data.error}</span>`; }
    });



     formRegistro?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const payload = {
            // .trim() remueve espacios accidentales al inicio o al final
            usuario: document.getElementById('regUsuario').value.trim(),
            correo: document.getElementById('regCorreo').value.trim(),
            password: document.getElementById('regPassword').value,
            nombreCompleto: document.getElementById('regNombre').value.trim(), // Envía el nombre con sus espacios internos intactos
            moto: document.getElementById('regMoto').value.trim()
        };
        const res = await fetch('/api/auth/registrar', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
        const data = await res.json();
        if(data.success) {
            divAlerta.innerHTML = `<span style="color:#28a745;">✅ ¡Registrado! Inicia sesión ahora.</span>`;
            formRegistro.reset(); tabLogin.click();
        } else { divAlerta.innerHTML = `<span style="color:#ff4d4d;">❌ ${data.error}</span>`; }
    });
});
