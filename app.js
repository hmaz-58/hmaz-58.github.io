let map;
let startMarker;
let markers = [];
let startLocation;
let locations = [];
let activeInputId = null; // 追加
let routingControls = []; // 追加

const redIcon = L.icon({
    iconUrl: 'leaflet/images/marker-icon-red.png', // ローカルパスに変更
    shadowUrl: 'leaflet/images/marker-shadow.png', // ローカルの影画像
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

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
    // 前回の経路とマーカーをクリア
    routingControls.forEach(control => map.removeControl(control));
    routingControls = [];
    markers.forEach(marker => map.removeLayer(marker));
    markers = [];
    startLocation = null;
    locations = []; // 場所データ配列をクリア

    const startAddress = document.getElementById('startLocationInput').value;
    const locationInputs = [];
    for (let i = 1; i <= 15; i++) { // 10 から 15 に変更
        const locationInput = document.getElementById(`locationInput${i}`).value;
        if (locationInput) {
            locationInputs.push({ address: locationInput, index: i }); // 場所名とインデックスを保存
        }
    }

    // 住所から緯度経度を取得
    const geocodePromises = [];
    if (startAddress) {
        geocodePromises.push(geocodeAddress(startAddress).then(location => {
            if (location) {
                startLocation = location;
                //addMarker(location); // 削除
            }
        }));
    }
    locationInputs.forEach(locationInput => {
        geocodePromises.push(geocodeAddress(locationInput.address).then(location => {
            if (location) {
                locations.push({ coords: location, name: locationInput.address, index: locationInput.index }); // 座標と名前を保存
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

function addMarker(location, icon = null) {
    const markerOptions = icon ? { icon: icon } : {};
    const marker = L.marker(location, markerOptions).addTo(map);
    markers.push(marker);
}

function calculateAndDisplayRoutes() {
    if (!startLocation) {
        alert("出発地点を設定してください。");
        return;
    }

    // 各到着地点に対して個別の経路を計算
    const distanceList = document.getElementById('distanceList');
    distanceList.innerHTML = ''; // clear previous distances

    // 出発地点のマーカーを追加
    const startLocationName = document.getElementById('startLocationInput').value; // 出発地点名を取得
    const startMarker = L.marker(startLocation, redIcon).addTo(map); // マーカーを再作成
    startMarker.bindTooltip(`${startLocationName}<br>出発地点`, { permanent: true }); // ツールチップを追加
    markers.push(startMarker);

    locations.forEach(location => { // location は { coords, name } オブジェクト
        const waypoints = [L.latLng(startLocation[0], startLocation[1]), L.latLng(location.coords[0], location.coords[1])];

        const routingControl = L.Routing.control({
            waypoints: waypoints,
            routeWhileDragging: true,
            createMarker: function() { return null; }, // suppress default markers
            show: false // コントロールパネル全体を非表示
        }).addTo(map);
        routingControls.push(routingControl); // コントロールを配列に追加

        routingControl.on('routesfound', (e) => {
            const routes = e.routes;
            if (routes && Array.isArray(routes) && routes.length > 0 && routes[0].summary) {
                const totalDistance = routes[0].summary.totalDistance;

                const distanceKm = (totalDistance / 1000).toFixed(2);

                const marker = L.marker(location.coords).addTo(map); // マーカーを再作成
                marker.bindTooltip(`${location.name}<br>距離: ${distanceKm} km`, { permanent: true }); // ツールチップを追加
                markers.push(marker);

                const li = document.createElement('li');
                li.textContent = `到着地点 ${location.index}: 合計距離: ${distanceKm} km`;
                distanceList.appendChild(li);

            } else {
                console.error('ルート情報が不正です:', routes);
                alert('ルート計算に失敗しました。');
            }
        });
    });
}

window.onload = initMap;
