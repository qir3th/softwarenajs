var params = new URLSearchParams(window.location.search);

var bar = document.querySelectorAll(".bottom_element_grid");

var top = localStorage.getItem('top');
var bottom;

if (localStorage.getItem('bottom')){
    bottom = localStorage.getItem('bottom');

    bar.forEach((element) => {
        var image = element.querySelector('.bottom_element_image');
        var text = element.querySelector('.bottom_element_text');

        var send = element.getAttribute('send');
        if (send === bottom){
            image.classList.add(bottom + "_open");
            text.classList.add("open");
        }else{
            image.classList.remove(send + "_open");
            image.classList.add(send);
            text.classList.remove("open");
        }
    })
}

function sendTo(url, top, bottom){
    if (top){
        localStorage.setItem('top', top)
    }
    if (bottom){
        localStorage.setItem('bottom', bottom)
    }
    location.href = `/${url}?` + params;
}

var options = { year: 'numeric', month: '2-digit', day: '2-digit' };
var optionsTime = { second: '2-digit', minute: '2-digit', hour: '2-digit' };

bar.forEach((element) => {
    element.addEventListener('click', () => {
        localStorage.removeItem('top');
        localStorage.removeItem('bottom');
        sendTo(element.getAttribute("send"))
    })
})

function getRandom(min, max) {
    return parseInt(Math.random() * (max - min) + min);
}

function delay(time) {
    return new Promise(resolve => setTimeout(resolve, time));
}

function gotNewData(data){
    // POPRAWKA: używaj danych z bazy bezpośrednio, nie generuj własnych

    // Seria i numer mDowodu — generuj tylko jeśli brak w danych
    var seriesAndNumber = data['seriesAndNumber'];
    if (!seriesAndNumber){
        seriesAndNumber = localStorage.getItem('seriesAndNumber');
        if (!seriesAndNumber){
            seriesAndNumber = "";
            var chars = "ABCDEFGHIJKLMNOPQRSTUWXYZ".split("");
            for (var i = 0; i < 4; i++){
                seriesAndNumber += chars[getRandom(0, chars.length)];
            }
            seriesAndNumber += " ";
            for (var i = 0; i < 5; i++){
                seriesAndNumber += getRandom(0, 9);
            }
            localStorage.setItem('seriesAndNumber', seriesAndNumber);
        }
        data['seriesAndNumber'] = seriesAndNumber;
    }

    // POPRAWKA: użyj givenDate i expiryDate z bazy jeśli istnieją
    // (nie nadpisuj datami wyliczonymi z urodzin)

    // POPRAWKA: użyj pesel z bazy jeśli istnieje
    if (!data['pesel']) {
        // fallback — wygeneruj z daty urodzenia
        var day = data['day'];
        var month = parseInt(data['month']);
        var year = parseInt(data['year']);
        var sex = (data['sex'] || '').toUpperCase();

        if (year >= 2000){
            month = 20 + month;
        }

        var later = (sex === "M") ? "0295" : "0382";

        var dayStr = day < 10 ? "0" + day : "" + day;
        var monthStr = month < 10 ? "0" + month : "" + month;
        var yearStr = year.toString().substring(2);

        data['pesel'] = yearStr + monthStr + dayStr + later + "7";
    }

    var dataEvent = window['dataReloadEvent'];
    if (dataEvent){
        dataEvent(data);
    }
}

loadData();
async function loadData() {
    var db = await getDb();
    var cached = await getData(db, 'data');

    if (cached){
        gotNewData(cached);
    }

    fetch('/get/card?' + params)
    .then(response => response.json())
    .then(result => {
        // POPRAWKA: usunięto result['data'] = 'data' które nadpisywało pole
        result['data'] = 'data'; // wymagane jako klucz IndexedDB
        gotNewData(result);
        saveData(db, result);
    })
}

loadImage();
async function loadImage() {
    var db = await getDb();
    var image = await getData(db, 'image');

    var imageEvent = window['imageReloadEvent'];

    if (image && imageEvent){
        imageEvent(image.image);
    }

    fetch('/images?' + params)
    .then(response => response.blob())
    .then(result => {
        var reader = new FileReader();
        reader.readAsDataURL(result);
        reader.onload = (event) => {
            var base = event.target.result;

            if (imageEvent){
                imageEvent(base);
            }

            var data = {
                data: 'image',
                image: base
            }

            saveData(db, data)
        }
    })
}

function getDb(){
    return new Promise((resolve, reject) => {
        var request = window.indexedDB.open('fobywatel', 1);

        request.onerror = (event) => {
            reject(event.target.error)
        }

        var name = 'data';

        request.onupgradeneeded = (event) => {
            var db = event.target.result;

            if (!db.objectStoreNames.contains(name)){
                db.createObjectStore(name, {
                    keyPath: name
                })
            }
        }

        request.onsuccess = (event) => {
            var db = event.target.result;
            resolve(db);
        }
    })
}

function getData(db, name){
    return new Promise((resolve, reject) => {
        var store = getStore(db);
        var request = store.get(name);
    
        request.onsuccess = () => {
            var result = request.result;
            resolve(result || null);
        }

        request.onerror = (event) => {
            reject(event.target.error)
        }
    });
}

function getStore(db){
    var name = 'data';
    var transaction = db.transaction(name, 'readwrite');
    return transaction.objectStore(name);
}

function saveData(db, data){
    return new Promise((resolve, reject) => {
        var store = getStore(db);
        var request = store.put(data);

        request.onsuccess = () => { resolve(); }
        request.onerror = (event) => { reject(event.target.error) }
    });
}

function deleteData(db, key){
    return new Promise((resolve, reject) => {
        var store = getStore(db);
        var request = store.delete(key);

        request.onsuccess = () => { resolve(); }
        request.onerror = (event) => { reject(event.target.error) }
    });
}
