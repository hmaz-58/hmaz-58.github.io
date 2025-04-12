let map;
let startMarker;
let markers = [];
let startLocation;
let locations = [];
let activeInputId = null; // 追加

function initMap() {
    map = L.map('map').setView([35.6895, 139.6917], 10); // 東京の中心

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    // 地図クリック時の処理
    map.on('click', (event) => {
        if (activeInputId) {
            // 逆ジオコーディング
            fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${event.latlng.lat}&lon=${event.latlng.lng}`)
                .then(response => response.json())
                .then(data => {
                    if (data && data.display_name) {
                        document.getElementById(activeInputId).value = data.display_name;
                    } else {
                        alert('住所が見つかりませんでした。');
                    }
                });
        }
    });

    // テキストボックスにフォーカスが当たった時の処理
    const inputs = document.querySelectorAll('input[type="text"]');
    inputs.forEach(input => {
        input.addEventListener('focus', () => {
            activeInputId = input.id;
        });
    });

    // 経路検索ボタンの処理
    document.getElementById('searchRouteButton').addEventListener('click', searchRoute);
}

function searchRoute() {
    startLocation = null;
    locations = [];
    markers.forEach(marker => map.removeLayer(marker));
    markers = [];

    const startAddress = document.getElementById('startLocationInput').value;
    const locationInputs = [];
    for (let i = 1; i <= 10; i++) {
        const locationInput = document.getElementById(`locationInput${i}`).value;
        if (locationInput) {
            locationInputs.push(locationInput);
        }
    }

    // 住所から緯度経度を取得
    const geocodePromises = [];
    if (startAddress) {
        geocodePromises.push(geocodeAddress(startAddress).then(location => {
            if (location) {
                startLocation = location;
                addMarker(location);
            }
        }));
    }
    locationInputs.forEach((address, index) => {
        geocodePromises.push(geocodeAddress(address).then(location => {
            if (location) {
                locations.push(location);
                //addMarker(location); // Marker is added in calculateAndDisplayRoutes
            }
        }));
    });

    Promise.all(geocodePromises).then(() => {
        if (startLocation && locations.length > 0) {
            calculateAndDisplayRoutes();
        } else {
            alert('出発地点と到着地点を入力してください。');
        }
    });
}

function geocodeAddress(address) {
    return fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${address}`)
        .then(response => response.json())
        .then(data => {
            if (data.length > 0) {
                return [data[0].lat, data[0].lon];
            } else {
                alert('住所が見つかりませんでした。');
                return null;
            }
        });
}

function addMarker(location) {
    const marker = L.marker(location).addTo(map);
    markers.push(marker);
}

function calculateAndDisplayRoutes() {
    if (!startLocation) {
        alert("出発地点を設定してください。");
        return;
    }

    // 既存のルーティングコントロールとマーカーを削除
    markers.forEach(marker => map.removeLayer(marker));
    markers = [];

    // 出発地点のマーカーを追加
    addMarker(startLocation);

    // 各到着地点に対して個別の経路を計算
    const distanceList = document.getElementById('distanceList');
    distanceList.innerHTML = ''; // clear previous distances

    locations.forEach((location, index) => {
        const waypoints = [L.latLng(startLocation[0], startLocation[1]), L.latLng(location[0], location[1])];

        const routingControl = L.Routing.control({
            waypoints: waypoints,
            routeWhileDragging: true,
            createMarker: function() { return null; } // suppress default markers
        }).addTo(map);

        routingControl.on('routesfound', (e) => {
            const routes = e.routes;
            // routes が存在し、配列であり、少なくとも1つの要素があるか確認
            if (routes && Array.isArray(routes) && routes.length > 0 && routes[0].summary) {
                const totalDistance = routes[0].summary.totalDistance;
                const totalTime = routes[0].summary.totalTime;

                const li = document.createElement('li');
                li.textContent = `到着地点 ${index + 1}: 合計距離: ${(totalDistance / 1000).toFixed(2)} km, 合計時間: ${(totalTime / 3600).toFixed(2)} 時間`;
                distanceList.appendChild(li);

            } else {
                console.error('ルート情報が不正です:', routes);
                alert('ルート計算に失敗しました。');
            }
        });
        addMarker(location);
    });
}

window.onload = initMap;
