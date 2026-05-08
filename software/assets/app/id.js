var params = new URLSearchParams(window.location.search);
var cardToken = params.get('card_token') || '';
var storedPassword = localStorage.getItem('pwd_' + cardToken) || '';

document.querySelector(".login").addEventListener('click', () => {
    tryLogin();
});

var welcome = "Dzień dobry!";
var date = new Date();
if (date.getHours() >= 18){
    welcome = "Dobry wieczór!"
}
document.querySelector(".welcome").innerHTML = welcome;

function toHome(){
    location.href = '/documents?' + params;
}

var input = document.querySelector(".password_input");
input.style.color = 'white';

input.addEventListener("keypress", (event) => {
    if (event.key === 'Enter') {
        document.activeElement.blur();
        tryLogin();
    }
})

var dot = "•";
var original = "";
var eye = document.querySelector(".eye");

input.addEventListener("input", () => {
    var value = input.value.toString();
    var char = value.substring(value.length - 1);
    if (value.length < original.length){
        original = original.substring(0, original.length - 1);
    }else{
        original = original + char;
    }
    if (!eye.classList.contains("eye_close")){
        var dots = "";
        for (var i = 0; i < value.length - 1; i++){
            dots = dots + dot
        }
        input.value = dots + char;
        delay(3000).then(() => {
            value = input.value;
            if (value.length != 0){
                input.value = value.substring(0, value.length - 1) + dot
            }
        });
    }
})

function delay(time, length) {
    return new Promise(resolve => setTimeout(resolve, time));
}

eye.addEventListener('click', () => {
    var classlist = eye.classList;
    if (classlist.contains("eye_close")){
        classlist.remove("eye_close");
        var dots = "";
        for (var i = 0; i < input.value.length - 1; i++){
            dots = dots + dot
        }
        input.value = dots;
    }else{
        classlist.add("eye_close");
        input.value = original;
    }
})

// ── Weryfikacja hasła ─────────────────────────────────────────
function tryLogin(){
    if (!storedPassword) { toHome(); return; }
    if (original === storedPassword) {
        toHome();
    } else {
        input.style.borderColor = '#e05c5c';
        input.value = '';
        original = '';
        delay(800).then(() => { input.style.borderColor = ''; });
    }
}

// ── Face ID / Touch ID ────────────────────────────────────────
// Odpala się automatycznie jeśli dostępne i karta ma hasło
async function tryFaceId(){
    if (!window.PublicKeyCredential) return;
    try {
        var available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
        if (!available) return;

        var credKey = 'faceid_cred_' + cardToken;
        var credIdB64 = localStorage.getItem(credKey);

        if (!credIdB64) {
            // Pierwsza wizyta — rejestracja klucza biometrycznego
            var regChallenge = crypto.getRandomValues(new Uint8Array(32));
            var userId = new TextEncoder().encode(cardToken || 'user');
            var cred = await navigator.credentials.create({
                publicKey: {
                    challenge: regChallenge,
                    rp: { name: 'mObywatel', id: location.hostname },
                    user: { id: userId, name: 'uzytkownik', displayName: 'uzytkownik' },
                    pubKeyCredParams: [
                        { type: 'public-key', alg: -7 },
                        { type: 'public-key', alg: -257 }
                    ],
                    authenticatorSelection: {
                        authenticatorAttachment: 'platform',
                        userVerification: 'required'
                    },
                    timeout: 60000
                }
            });
            credIdB64 = btoa(String.fromCharCode(...new Uint8Array(cred.rawId)));
            localStorage.setItem(credKey, credIdB64);
            toHome();
        } else {
            // Kolejne wizyty — uwierzytelnienie
            var authChallenge = crypto.getRandomValues(new Uint8Array(32));
            var credIdBytes = Uint8Array.from(atob(credIdB64), c => c.charCodeAt(0));
            await navigator.credentials.get({
                publicKey: {
                    challenge: authChallenge,
                    rpId: location.hostname,
                    allowCredentials: [{ type: 'public-key', id: credIdBytes }],
                    userVerification: 'required',
                    timeout: 60000
                }
            });
            toHome();
        }
    } catch(e) {
        // Użytkownik odrzucił lub niedostępne — zostaje ekran hasła
    }
}

// Uruchom Face ID automatycznie przy wejściu
if (storedPassword) {
    tryFaceId();
}
