var confirmElement = document.querySelector(".confirm");

var time = document.getElementById("time");

if (localStorage.getItem("update") == null){
    localStorage.setItem("update", "24.12.2024")
}

var date = new Date();

var dataReloadEvent = (data) => {
    loadReadyData(data);
}

var imageReloadEvent = (image) => {
    setImage(image);
}

var updateText = document.querySelector(".bottom_update_value");
updateText.innerHTML = localStorage.getItem("update");

var update = document.querySelector(".update");
update.addEventListener('click', () => {
    var newDate = date.toLocaleDateString("pl-PL", options);
    localStorage.setItem("update", newDate);
    updateText.innerHTML = newDate;

    scroll(0, 0)
});

setClock();
function setClock(){
    date = new Date();
    time.innerHTML = "Czas: " + date.toLocaleTimeString("pl-PL", optionsTime) + " " + date.toLocaleDateString("pl-PL", options);    
    delay(1000).then(() => {
        setClock();
    })
}

var unfold = document.querySelector(".info_holder");
unfold.addEventListener('click', () => {

    if (unfold.classList.contains("unfolded")){
      unfold.classList.remove("unfolded");
    }else{
      unfold.classList.add("unfolded");
    }

})

function loadReadyData(result){
    Object.keys(result).forEach((key) => {
      result[key] = htmlEncode(result[key])
    })
    
    var sex = result['sex'];
    
    var textSex;
    if (sex === "m"){
        textSex = "Mężczyzna"
    }else if (sex === "k"){
        textSex = "Kobieta"
    }

    setData('seriesAndNumber', result['seriesAndNumber'].toUpperCase());
    setData("name", result['name'].toUpperCase());
    setData("surname", result['surname'].toUpperCase());
    setData("nationality", result['nationality'].toUpperCase());
    setData("fathersName", result['fathersName'].toUpperCase());
    setData("mothersName", result['mothersName'].toUpperCase());
    setData("birthday", result['day'] + "." + String(result['month']).padStart(2, '0') + "." + result['year']);
    setData("familyName", result['familyName'].toUpperCase());
    setData("sex", textSex.toUpperCase());
    setData("fathersFamilyName", result['fathersFamilyName'].toUpperCase());
    setData("mothersFamilyName", result['mothersFamilyName'].toUpperCase());
    setData("birthPlace", result['birthPlace'].toUpperCase());
    setData("countryOfBirth", result['countryOfBirth'].toUpperCase());
    setData("adress", result['adress'].toUpperCase());
    
    setData('givenDate', result['givenDate']);
    setData('expiryDate', result['expiryDate']);

    if (!localStorage.getItem("homeDate")){
      var homeDay = getRandom(1, 25);
      var homeMonth = getRandom(0, 12);
      var homeYear = getRandom(2012, 2019);
    
      var homeDate = new Date();
      homeDate.setDate(homeDay);
      homeDate.setMonth(homeMonth);
      homeDate.setFullYear(homeYear)
    
      localStorage.setItem("homeDate", homeDate.toLocaleDateString("pl-PL", options))
    }
    
    document.querySelector(".home_date").innerHTML = localStorage.getItem("homeDate");

    setData("pesel", result['pesel']);
}

function setImage(image){
    document.getElementById("cwel").src = image;
}

function setData(id, value){
    document.getElementById(id).innerHTML = value;
}
