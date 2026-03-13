// Конфигурация API
const WEATHER_API_BASE = 'https://api.open-meteo.com/v1/forecast'; // API получения прогноза погоды
const GEO_API_BASE = 'https://geocoding-api.open-meteo.com/v1/search'; // API получения координат города

// Ключ хранилища данных в local storage
const STORAGE_KEY = 'weather_cities';

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

// Сохранение списка городов
function saveToStorage() {
    const citiesToSave = cities.map(({ weatherData, ...rest }) => rest); // без данных погоды
    localStorage.setItem(STORAGE_KEY, JSON.stringify(citiesToSave));
}

// Загрузка списка из local storage
function loadFromStorage() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        try {
            return JSON.parse(saved);
        } catch (e) {
            return null;
        }
    }
    return null;
}

// Инициализация
function init() {
    // Подгрузка данных городов
    const savedCities = loadFromStorage();
    
    if (savedCities && savedCities.length > 0) {
        // Восстанавление городов из сохранённых
        cities = savedCities.map(city => ({
            ...city,
            weatherData: null
        }));
    } else {
        cities = [];
    }

    updateCurrentLocation(); // всегда пытаться обновить геолокацию при перезагрузке
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

// Обновление геолокации
function updateCurrentLocation() {
    if (!navigator.geolocation) {
        // Геолокация не поддерживается — загрузка существующих городов (если есть)
        if (cities.length > 0) {
            showGlobalError('Геолокация не поддерживается. Показаны сохранённые города.');
            refreshAllCities();
        } else {
            handleGeolocationError({ message: 'Геолокация не поддерживается' });
        }
        return;
    }

    // Запрос геолокации через браузер
    navigator.geolocation.getCurrentPosition(
        position => {
            const { latitude, longitude } = position.coords;
            const currentIndex = cities.findIndex(c => c.type === 'current');
            
            if (currentIndex !== -1) {
                // Обновление существующего current города, если уже существовал
                cities[currentIndex] = {
                    ...cities[currentIndex],
                    latitude,
                    longitude,
                    displayName: 'Текущее местоположение',
                    cityName: null,
                    weatherData: null
                };
            } else {
                // Иначе - создание нового current города
                cities.push({
                    id: Date.now() + Math.random(),
                    type: 'current',
                    displayName: 'Текущее местоположение',
                    cityName: null,
                    latitude,
                    longitude,
                    weatherData: null
                });
            }
            
            saveToStorage();
            refreshAllCities(); // загрузка погоды для всех городов
        },
        error => {
            // При ошибке геолокации удалить current города
            removeCurrentCities();

            if (cities.length === 0) {
                // Нет сохранённых городов — ручной ввод
                handleGeolocationError(error);
            } else {
                // Есть сохранённые города — загрузка их погоды
                showGlobalError('Не удалось определить текущее местоположение. Показаны сохранённые города.');
                refreshAllCities();
            }
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
    saveToStorage(); // сохранение
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
        city.error = undefined; // очищаем предыдущую ошибку
    } catch (err) { // ошибка получения данных
        city.weatherData = null; // оставляем пустым
        city.error = 'Не удалось загрузить данные. Попробуйте позже.';
    } finally {
        // Рендеринг полученных данных
        renderAllCities();
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
        headerDiv.style.flexWrap = 'wrap';
        headerDiv.style.gap = '0.5rem';

        const title = document.createElement('h2');
        title.className = 'weather-card__title';
        title.textContent = city.displayName;
        title.style.wordBreak = 'break-word';
        headerDiv.appendChild(title);

        // При типе additional - кнопка удаления
        if (city.type === 'additional') {
            const deleteBtn = document.createElement('button');
            deleteBtn.textContent = '✕';
            deleteBtn.className = 'weather-card__delete';
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // остановка всплытия события
                removeCity(city.id); // удаление города при нажатии
            });
            headerDiv.appendChild(deleteBtn);
        }

        card.appendChild(headerDiv);

        // Вывод ошибки
        if (city.error) {
            const errorMsg = document.createElement('p');
            errorMsg.className = 'weather-card__error';
            errorMsg.textContent = city.error;
            card.appendChild(errorMsg);
        } else if (city.weatherData) {
            // Если данные погоды загружены, отображаем их
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

                // Контейнер для температур с подписями
                const tempContainer = document.createElement('div');
                tempContainer.style.display = 'flex';
                tempContainer.style.gap = '0.75rem';
                tempContainer.style.alignItems = 'center';

                // Максимальная температура (день)
                const maxWrapper = document.createElement('div');
                maxWrapper.style.display = 'flex';
                maxWrapper.style.flexDirection = 'column';
                maxWrapper.style.alignItems = 'center';

                // Подпись "Д"
                const maxLabel = document.createElement('span');
                maxLabel.textContent = 'Д';
                maxLabel.style.fontSize = '0.7rem';
                maxLabel.style.color = '#64748b';

                // Значение
                const maxValue = document.createElement('span');
                maxValue.className = 'weather-card__temp';
                maxValue.textContent = `${Math.round(maxTemp)}°`;

                maxWrapper.appendChild(maxLabel);
                maxWrapper.appendChild(maxValue);

                // Минимальная температура (ночь)
                const minWrapper = document.createElement('div');
                minWrapper.style.display = 'flex';
                minWrapper.style.flexDirection = 'column';
                minWrapper.style.alignItems = 'center';

                // Подпись "Н"
                const minLabel = document.createElement('span');
                minLabel.textContent = 'Н';
                minLabel.style.fontSize = '0.7rem';
                minLabel.style.color = '#64748b';

                // Значение
                const minValue = document.createElement('span');
                minValue.className = 'weather-card__temp';
                minValue.textContent = `${Math.round(minTemp)}°`;

                minWrapper.appendChild(minLabel);
                minWrapper.appendChild(minValue);

                tempContainer.appendChild(maxWrapper);
                tempContainer.appendChild(minWrapper);

                dayDiv.appendChild(dateSpan);
                dayDiv.appendChild(tempContainer);
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

// Обновление погоды для всех городов
async function refreshAllCities() {
    if (cities.length === 0) return;
    
    showLoader(true);
    hideGlobalError();

    // Запрос погоды для всех городов асинхронно
    await Promise.allSettled(cities.map(async (city) => {
        const url = `${WEATHER_API_BASE}?latitude=${city.latitude}&longitude=${city.longitude}&daily=weathercode,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=3`;
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error();
            const data = await response.json();
            city.weatherData = data.daily;
            city.error = undefined;
        } catch (err) {
            city.weatherData = null;
            city.error = 'Ошибка загрузки';
        }
    }));
    
    // Рендеринг того, что есть
    renderAllCities();
    showLoader(false);
}

// Удаление города
function removeCity(cityId) {
    cities = cities.filter(city => city.id !== cityId);
    saveToStorage(); // сохранение
    renderAllCities(); // пересборка
}

// Удаление городов со типом current
function removeCurrentCities() {
    const hadCurrent = cities.some(c => c.type === 'current');
    cities = cities.filter(c => c.type !== 'current');
    if (hadCurrent) {
        saveToStorage(); // сохранение
    }
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

    // Проверка на дубликат (по координатам с небольшим допуском)
    const isDuplicate = cities.some(city => 
        Math.abs(city.latitude - selectedCity.latitude) < 0.01 && 
        Math.abs(city.longitude - selectedCity.longitude) < 0.01
    );

    if (isDuplicate) {
        cityError.textContent = 'Этот город уже добавлен';
        return;
    }

    // Определение типа города: если cities пуст, то current, иначе additional
    const type = cities.length === 0 ? 'current' : 'additional';    
    
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
        refreshAllCities();
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