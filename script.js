// Конфигурация API
const WEATHER_API_BASE = 'https://api.open-meteo.com/v1/forecast'; // API получения прогноза погоды
const GEO_API_BASE = 'https://geocoding-api.open-meteo.com/v1/search'; // API получения координат города

// Элементы DOM
const refreshBtn = document.getElementById('refreshBtn');
const cityInput = document.getElementById('cityInput');
const addCityForm = document.getElementById('addCityForm');
const suggestionsList = document.getElementById('suggestions');
const cityError = document.getElementById('cityError');
const cardsContainer = document.getElementById('cardsContainer');
const loader = document.getElementById('loader');
const globalError = document.getElementById('globalError');

// Состояние приложения
let cities = []; // массив объектов городов
let selectedCity = null; // временно выбранный город из подсказок
let searchTimeout = null;

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', init);

function init() {
    // Запрос геолокацию
    requestGeolocation();
}

// Геолокация
function requestGeolocation() {
    // По умолчанию идёт загрузка
    showLoader(true);
    hideGlobalError();

    if (!navigator.geolocation) {
        // Если браузер не поддерживает геолокацию
        handleGeolocationError({ message: 'Геолокация не поддерживается браузером' });
        return;
    }

    // Запрос геолокации через браузер
    navigator.geolocation.getCurrentPosition(
        position => {
            const { latitude, longitude } = position.coords;
            // Добавление текущего местоположения как города
            addCityFromCoordinates('Текущее местоположение', latitude, longitude, 'current');
        },
        error => {
            handleGeolocationError(error); // обработка ошибки
        }
    );
}

// Обработка ошибки поиска геолокации
function handleGeolocationError(error) {
    showLoader(false);

    let message = 'Не удалось определить местоположение. Пожалуйста, введите город вручную.';
    if (error.code === 1) { // PERMISSION_DENIED
        message = 'Доступ к геолокации запрещён. Введите город вручную.';
    }
    
    // Показ ошибки
    showGlobalError(message);
    // Фокус на поле ввода
    cityInput.focus();
}

// Добавление города в список и загрузка погоды
function addCityFromCoordinates(displayName, lat, lon, type = 'additional', cityName = null) {
    const newCity = {
        id: Date.now() + Math.random(), // уникальный id
        type: type,
        displayName: displayName,
        cityName: cityName || displayName,
        latitude: lat,
        longitude: lon,
        weatherData: null // пока пусто
    };

    cities.push(newCity); // добавление в общий список городов
    fetchWeatherForCity(newCity); // получение погоды
}

// Запрос погоды
async function fetchWeatherForCity(city) {
    // По умолчанию идёт загрузка
    showLoader(true);
    hideGlobalError();

    // Запрос через координаты широты и долготы
    const url = `${WEATHER_API_BASE}?latitude=${city.latitude}&longitude=${city.longitude}&daily=weathercode,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=3`;

    try {
        const response = await fetch(url); // асинхронное ожидание
        if (!response.ok) throw new Error('Ошибка загрузки погоды');
        const data = await response.json();
        city.weatherData = data.daily;

        // Рендеринг полученных данных
        renderAllCities();
    } catch (err) { // ошибка получения данных
        showGlobalError('Не удалось загрузить прогноз. Попробуйте позже.');
        city.weatherData = null; // оставляем пустым
        renderAllCities(); // рендеринг
    } finally {
        showLoader(false);
    }
}

// Рендеринг всех карточек
function renderAllCities() {
    // Очистка контейнера
    cardsContainer.innerHTML = '';

    cities.forEach(city => {
        // Добавление города
        const card = document.createElement('article');
        card.className = 'weather-card';
        card.dataset.cityId = city.id;

        // Заголовок с названием
        const headerDiv = document.createElement('div');
        headerDiv.style.display = 'flex';
        headerDiv.style.justifyContent = 'space-between';
        headerDiv.style.alignItems = 'center';
        headerDiv.style.marginBottom = '1rem';

        const title = document.createElement('h2');
        title.className = 'weather-card__title';
        title.textContent = city.displayName;
        headerDiv.appendChild(title);

        // При типе additional - кнопка удаления
        if (city.type === 'additional') {
            const deleteBtn = document.createElement('button');
            deleteBtn.textContent = '✕';
            deleteBtn.style.background = 'none';
            deleteBtn.style.border = 'none';
            deleteBtn.style.fontSize = '1.2rem';
            deleteBtn.style.cursor = 'pointer';
            deleteBtn.style.color = '#94a3b8';
            deleteBtn.style.padding = '0 0.5rem';
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // остановка всплытия события
                removeCity(city.id); // удаление города при нажатии
            });
            headerDiv.appendChild(deleteBtn);
        }

        card.appendChild(headerDiv);

        // Если данные погоды загружены, отображаем их
        if (city.weatherData) {
            const daysContainer = document.createElement('div');
            daysContainer.className = 'weather-card__days';

            // Форматирование дат
            const options = { weekday: 'short', day: 'numeric', month: 'short' };
            for (let i = 0; i < 3; i++) {
                const date = new Date(city.weatherData.time[i] + 'T12:00:00'); // полдень для надёжности
                const dayStr = date.toLocaleDateString('ru-RU', options);

                // max и min температуры дня
                const maxTemp = city.weatherData.temperature_2m_max[i];
                const minTemp = city.weatherData.temperature_2m_min[i];

                // Контейнер одного дня с датой и температурами
                const dayDiv = document.createElement('div');
                dayDiv.className = 'weather-card__day';

                const dateSpan = document.createElement('span');
                dateSpan.className = 'weather-card__date';
                dateSpan.textContent = dayStr;

                const tempSpan = document.createElement('span');
                tempSpan.className = 'weather-card__temp';
                tempSpan.textContent = `${Math.round(maxTemp)}° / ${Math.round(minTemp)}°`;

                dayDiv.appendChild(dateSpan);
                dayDiv.appendChild(tempSpan);
                daysContainer.appendChild(dayDiv);
            }

            card.appendChild(daysContainer);

        } else {
            // Иначе сообщение о недоступности
            const errorMsg = document.createElement('p');
            errorMsg.textContent = 'Данные недоступны';
            errorMsg.style.color = '#ef4444';
            errorMsg.style.padding = '1rem 0';
            card.appendChild(errorMsg);
        }

        cardsContainer.appendChild(card);
    });
}

// Удаление города
function removeCity(cityId) {
    cities = cities.filter(city => city.id !== cityId);
    renderAllCities(); // пересборка
}

// Поиск городов
cityInput.addEventListener('input', (e) => {
    const query = e.target.value.trim();
    if (query.length < 2) { // не показывать подсказку для слишком коротких строк
        hideSuggestions();
        return;
    }

    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => fetchCitySuggestions(query), 300);
});

// Получение подсказок городов
async function fetchCitySuggestions(query) {
    try {
        // Получение 5 городов из API с помощью начала запроса
        const response = await fetch(`${GEO_API_BASE}?name=${encodeURIComponent(query)}&count=5&language=ru&format=json`);
        if (!response.ok) throw new Error('Ошибка поиска');
        const data = await response.json();
        displaySuggestions(data.results || []); // отображение
    } catch (err) {
        // Скрытие подсказок при ошибке
        hideSuggestions();
    }
}

// Отображение подсказок городов
function displaySuggestions(results) {
    suggestionsList.innerHTML = '';
    if (results.length === 0) {
        hideSuggestions(); // скрытие, если ничего не найдено
        return;
    }

    // Отображение списка подсказок с запоминанием координат
    results.forEach(result => {
        const li = document.createElement('li');
        li.textContent = `${result.name}, ${result.country}`;
        li.dataset.lat = result.latitude;
        li.dataset.lon = result.longitude;
        li.dataset.name = result.name;
        li.addEventListener('click', () => selectSuggestion(result)); // слушать нажатие на город в списке
        suggestionsList.appendChild(li);
    });

    suggestionsList.style.display = 'block';
}

// Выбор города из списка подсказок
function selectSuggestion(result) {
    cityInput.value = result.name;
    selectedCity = {
        // Записываем координаты
        name: result.name,
        latitude: result.latitude,
        longitude: result.longitude
    };
    hideSuggestions();
    cityError.textContent = ''; // очистка ошибок
}

// Скрытие списка подсказок
function hideSuggestions() {
    suggestionsList.style.display = 'none';
}

// Обработчик добавления города
addCityForm.addEventListener('submit', (e) => {
    e.preventDefault(); // не перезагружать

    // Если не выбран город
    if (!selectedCity) {
        cityError.textContent = 'Пожалуйста, выберите город из списка';
        return;
    }

    // Определение типа города: если cities пуст, то current, иначе additional
    const type = cities.length === 0 ? 'current' : 'additional';
    const displayName = type === 'current' ? selectedCity.name : selectedCity.name;
    
    // Добалвние отображения города
    addCityFromCoordinates(selectedCity.name, selectedCity.latitude, selectedCity.longitude, type, selectedCity.name);

    // Очистка формы
    cityInput.value = '';
    selectedCity = null;
    cityError.textContent = '';
    hideSuggestions();
});

// Кнопка общего обновления
refreshBtn.addEventListener('click', () => {
    if (cities.length === 0) {
        // Если города нет, запросить геолокацию заново
        requestGeolocation();
    } else {
        // Запрос погоды для всех городов заново
        Promise.all(cities.map(city => fetchWeatherForCity(city)))
            .catch(() => showGlobalError('Ошибка при обновлении'));
    }
});

// Вспомогательная функция сообщения о загрузке контента
function showLoader(show) {
    loader.style.display = show ? 'block' : 'none';
    if (show) {
        cardsContainer.style.display = 'none';
    } else {
        cardsContainer.style.display = 'grid';
    }
}

// Вывод общей ошибки
function showGlobalError(message) {
    globalError.textContent = message;
    globalError.style.display = 'block';
}

// Скрытие общей ошибки
function hideGlobalError() {
    globalError.style.display = 'none';
}

// Клик вне списка подсказок скрывает его
document.addEventListener('click', (e) => {
    if (!suggestionsList.contains(e.target) && e.target !== cityInput) {
        hideSuggestions();
    }
});