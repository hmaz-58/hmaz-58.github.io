let map;
let startMarker;
let markers = [];
let startLocation; // { coords: [lat, lon], name: "住所", displayName: "表示名" }
let locations = []; // [{ coords: [lat, lon], name: "住所", displayName: "表示名", index: i }, ...]
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
        // 住所入力欄 (startLocationInput または locationInputX) がアクティブな場合のみ
        if (activeInputId && (activeInputId === 'startLocationInput' || activeInputId.startsWith('locationInput'))) {
            // 逆ジオコーディング
            document.getElementById(activeInputId).value = `${event.latlng.lat}, ${event.latlng.lng}`;
        }
    });

    // テキストボックスにフォーカスが当たった時の処理
    const inputs = document.querySelectorAll('input[type="text"]');
    inputs.forEach(input => {
        input.addEventListener('focus', () => {
            activeInputId = input.id;
        });
        input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                searchRoute();
            }
        });
    });

    // 経路検索ボタンの処理
    document.getElementById('searchRouteButton').addEventListener('click', searchRoute);

    // CSVファイルが選択された時の処理
    document.getElementById('csvFile').addEventListener('change', handleFileSelect);
}

function handleFileSelect(evt) {
    const file = evt.target.files[0];

    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const csv = e.target.result;
            const lines = csv.split('\n');
            const newLocations = [];

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (line === "") continue; // 空行をスキップ

                const values = line.split('\t');
                if (values.length >= 2) {
                    const displayName = values[0].trim();
                    const address = values[1].trim();
                    newLocations.push({ displayName: displayName, address: address });
                }
            }

            // 既存の到着地点をクリア
            for (let i = 1; i <= 15; i++) {
                document.getElementById(`locationInput${i}`).value = '';
                document.getElementById(`displayNameInput${i}`).value = '';
            }

            // CSVファイルから読み込んだデータを到着地点リストに設定
            for (let i = 0; i < Math.min(newLocations.length, 15); i++) {
                document.getElementById(`displayNameInput${i + 1}`).value = newLocations[i].displayName;
                document.getElementById(`locationInput${i + 1}`).value = newLocations[i].address;
            }
        }
        reader.readAsText(file, 'UTF-8');
    }
}

function searchRoute() {
    // 前回の経路詳細情報をクリア
    const routingContainers = document.querySelectorAll('.leaflet-routing-container');
    routingContainers.forEach(container => container.remove());

    // 前回の経路とマーカーをクリア
    routingControls.forEach(control => map.removeControl(control));
    routingControls = [];
    markers.forEach(marker => map.removeLayer(marker));
    markers = [];
    startLocation = null;
    locations = []; // 場所データ配列をクリア

    const startAddress = document.getElementById('startLocationInput').value;
    const startDisplayName = document.getElementById('startDisplayNameInput').value;
    const locationInputs = [];
    for (let i = 1; i <= 15; i++) { // 10 から 15 に変更
        const locationInput = document.getElementById(`locationInput${i}`).value;
        const displayNameInput = document.getElementById(`displayNameInput${i}`).value;
        if (locationInput) { // 住所が入力されている場合のみ処理
            locationInputs.push({ address: locationInput, displayName: displayNameInput, index: i }); // 場所名とインデックスを保存
        }
    }

    // 住所から緯度経度を取得
    const geocodePromises = [];
    if (startAddress) {
        geocodePromises.push(geocodeAddress(startAddress).then(locationCoords => {
            if (locationCoords) {
                startLocation = { coords: locationCoords, name: startAddress, displayName: startDisplayName }; // 出発地点情報
            }
        }));
    }
    locationInputs.forEach(locationInput => {
        geocodePromises.push(geocodeAddress(locationInput.address).then(locationCoords => {
            if (locationCoords) {
                locations.push({ coords: locationCoords, name: locationInput.address, displayName: locationInput.displayName, index: locationInput.index }); // 座標と名前、表示名を保存
            }
        }));
    });

    Promise.all(geocodePromises).then(() => {
        if (startLocation && locations.length > 0) {
            calculateAndDisplayRoutes();
        } else {
            alert('出発地点と、少なくとも1つの到着地点の住所を入力してください。');
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
                alert(`住所が見つかりませんでした: ${address}`);
                return null;
            }
        });
}

// マーカー追加関数は calculateAndDisplayRoutes 内で直接行うため不要に
// function addMarker(location, icon = null) {
//     const markerOptions = icon ? { icon: icon } : {};
//     const marker = L.marker(location, markerOptions).addTo(map);
//     markers.push(marker);
// }

function calculateAndDisplayRoutes() {
    if (!startLocation) {
        alert("出発地点を設定してください。");
        return;
    }

    const distanceList = document.getElementById('distanceList');

    // 範囲計算のために、出発地点の座標でboundsを初期化
    let bounds = new L.LatLngBounds([startLocation.coords]);

    // 各到着地点に対して個別の経路を計算
    // const distanceList = document.getElementById('distanceList'); // 削除
    // distanceList.innerHTML = ''; // 削除

    // 出発地点のマーカーを追加
    let startTooltipName = startLocation.displayName ? startLocation.displayName : "出発地点";
    const startMarker = L.marker(startLocation.coords, { icon: redIcon }).addTo(map); // マーカーを再作成
    startMarker.bindTooltip(startTooltipName, { permanent: true }); // ツールチップを追加
    markers.push(startMarker);

    locations.forEach(location => { // location は { coords, name, displayName, index } オブジェクト
        const waypoints = [L.latLng(startLocation.coords[0], startLocation.coords[1]), L.latLng(location.coords[0], location.coords[1])];

        const routingControl = L.Routing.control({
            waypoints: waypoints,
            routeWhileDragging: true,
            createMarker: function() { return null; }, // suppress default markers
            show: false // コントロールパネル全体を非表示
        }).addTo(map);
        routingControls.push(routingControl); // コントロールを配列に追加

        routingControl.on('routesfound', (e) => {
            const routes = e.routes;
            if (routes && Array.isArray(routes) && routes[0].summary) {
                const totalDistance = routes[0].summary.totalDistance;

                const distanceKm = (totalDistance / 1000).toFixed(1);
                let tooltipName = location.displayName || `到着地点 ${location.index}`;

                const marker = L.marker(location.coords).addTo(map);
                marker.bindTooltip(`${tooltipName}<br>距離: ${distanceKm} km`, { permanent: true });
                markers.push(marker);

                const distanceSpan = document.getElementById(`distance${location.index}`);
                if (distanceSpan) {
                    distanceSpan.textContent = `${distanceKm} km`;
                }

            } else {
                console.error('ルート情報が不正です:', routes);
                alert('ルート計算に失敗しました。');
            }
        });
         // 範囲を広げる
         bounds.extend(location.coords);
    });
    // すべてのマーカーが含まれるように地図の範囲を調整
    map.fitBounds(bounds);
}

function downloadCSV() {
    const locations = [];
    for (let i = 1; i <= 15; i++) {
        const displayName = document.getElementById(`displayNameInput${i}`).value;
        const location = document.getElementById(`locationInput${i}`).value;
        locations.push({ displayName: displayName, location: location });
    }

    let csvContent = "data:text/csv;charset=utf-8,";
    locations.forEach(location => {
        csvContent += `${location.displayName}\t${location.location}\r\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    // ファイル名を入力させるプロンプトを表示
    let filename = prompt("ファイル名を入力してください", "locations.csv");
    if (filename == null || filename == "") {
        filename = "locations.csv";
    }
    link.setAttribute("download", filename);
    document.body.appendChild(link); // Required for FF

    link.click();
    document.body.removeChild(link);
}

window.onload = () => {
    initMap();
    const modal = document.getElementById('csvModal');
    const openModalButton = document.getElementById('openModalButton');
    const closeModalButton = document.getElementById('closeModalButton');
    const importButton = document.getElementById('importButton');
    const downloadCsvButton = document.getElementById('downloadCsvButton');
    const csvFile = document.getElementById('csvFile');

    openModalButton.addEventListener('click', () => {
        modal.style.display = 'block';
    });

    closeModalButton.addEventListener('click', () => {
        modal.style.display = 'none';
    });

    window.addEventListener('click', (event) => {
        if (event.target == modal) {
            modal.style.display = 'none';
        }
    });

    importButton.addEventListener('click', () => {
        csvFile.click();
    });

    downloadCsvButton.addEventListener('click', downloadCSV);
};
