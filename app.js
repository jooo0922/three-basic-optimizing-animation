'use strict';

import * as THREE from 'https://threejsfundamentals.org/threejs/resources/threejs/r127/build/three.module.js';

import {
  BufferGeometryUtils
} from 'https://threejsfundamentals.org/threejs/resources/threejs/r127/examples/jsm/utils/BufferGeometryUtils.js';

import {
  OrbitControls
} from 'https://threejsfundamentals.org/threejs/resources/threejs/r127/examples/jsm/controls/OrbitControls.js';

// morphTargetInfluences 속성을 바꿔서 mesh의 전환 효과를 구현할거임.
// 이때 화면에 렌더링할 지오메트리의 influence는 1, 렌더링하지 않을 그룹의 influence는 0으로 설정하면 되는데
// 얘내들을 한방에 지정해버리면 애니메이션이 안보일테니까 이 influence값을 TWEEN 라이브러리를 이용해서 애니메이션을 줄거임.
import {
  TWEEN
} from 'https://threejsfundamentals.org/threejs/resources/threejs/r127/examples/jsm/libs/tween.module.min.js';

/**
 * Tween 라이브러리를 사용하여 애니메이션을 줄때는 매 프레임마다 호출해주는 render함수에서 TWEEN.update를 호출해야 함.
 * 
 * 근데 여기서 문제가 되는 게, tween.js는 연속 렌더링을 사용하도록 설계가 되어있어서 
 * 딱히 아무런 렌더링에 변화가 없더라도 항상 애니메이션을 계산해주도록 되어있다는거지
 * 
 * 반면에 이 예제에서는 requestAnimateIfNotRequested() 함수와 renderRequested 변수를 둬서 필요할 때만 render 함수를 호출하게 되어있음.
 * 
 * Tween을 사용하면서도 불필요한 렌더링을 제거하기 위해서 TweenManage라는 헬퍼 클래스를 만들어서 사용할거임.
 */
class TweenManager {
  constructor() {
    this.numTweensRunning = 0; // 이 값이 1이면 애니메이션이 아직 진행중인 거고, 0이 되면 애니메이션이 끝난거임.
  }

  // 이름 그대로 애니메이션의 complete를 조절해 줌.
  _handleComplete() {
    --this.numTweensRunning;

    // console.assert(조건문)은 조건문이 false면 에러메시지를 콘솔에 띄우고, true면 아무것도 안함.
    // 즉, numTweensRunning이 0, 1 둘 중 하나인데 0보다 작은 값이다? 에러가 났다는 거지. 애니메이션이 끝난 상태인데 _handleComplete을 또 호출했다던가...
    console.assert(this.numTweensRunning >= 0);
  }

  createTween(targetObject) {
    const self = this; // TweenManager 인스턴스 자체를 할당해놓음
    ++this.numTweensRunning; // Tween 객체로 목표 influence까지 mesh의 influence에 애니메이션을 주기 전 값을 +1해서 애니메이션이 진행중임을 알림
    let userCompleteFn = () => {};
    const tween = new TWEEN.Tween(targetObject).onComplete(function (...args) {
      self._handleComplete(); // 애니메이션이 끝나면 this.numTweensRunning이 다시 0으로 변하겠군
      userCompleteFn.call(this, ...args); // 이거는 전달받은 값들을 하나하나 복사해서 this와 함께 userCompleteFn 함수에 넘겨주면서 호출하라는 뜻
    });

    // 얘는 Tween 인스턴스의 onComplete 함수를 바꿔서 사용자가 콜백 함수를 지정할 수 있도록 하는거라는데... 왜 이렇게 하는건지는 잘 모르겠음ㅠ
    tween.onComplete = (fn) => {
      userCompleteFn = fn;
      return tween;
    };

    // 어쨋든 이 메소드를 호출하면 최종적으로 targetObject를 전달하면서 생성된 new TWEEN.Tween의 인스턴스를 리턴해 줌.
    return tween;
  }

  // render 함수에서 호출할 메소드
  update() {
    TWEEN.update();

    // render 함수 내에서 if block의 조건문에 이거를 리턴해줌으로써, 
    // this.numTweensRunning가 1이면 ture가 리턴되니까 if block이 통과되서 render 함수를 다시 호출하고,
    // 0이면 false가 리턴되니까 if block을 통과하지 못해서 render함수는 호출하지 않음. 
    return this.numTweensRunning > 0;
  }
}


function main() {
  // create WebGLRenderer
  const canvas = document.querySelector('#canvas');
  const renderer = new THREE.WebGLRenderer({
    canvas
  });
  const tweenManager = new TweenManager(); // 헬퍼클래스의 인스턴스를 생성해놓음.

  // create camera
  const fov = 60;
  const aspect = 2;
  const near = 0.1;
  const far = 10;
  const camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
  camera.position.z = 2.5;

  // create orbitcontrols
  const controls = new OrbitControls(camera, canvas); // 생성한 카메라와 이벤트를 받는 DOM 요소를 전달해줘야 함.
  controls.enableDamping = true; // 카메라 이동 시 관성(inertia) 효과를 줌.
  controls.enablePan = false; // 카메라 고정 후 수평 회전을 못하게 함. (카메라가 수평회전하면 지구본이 카메라 중심에서 벗어날테니까)
  // min,maxDistance는 dolly in, out의 최소, 최대값을 결정해주는 값임.
  // dolly vs zoom
  // dolly in/out은 카메라를 실제로 물리적으로 움직여서 피사체를 확대시키거나 축소해서 보여주지만
  // zoom in/out은 카메라의 초점 렌즈의 길이를 조절해서 피사체를 확대시키거나 축소해서 보여줌. 둘이 효과는 비슷하지만 원리가 다름.
  controls.minDistance = 1.2;
  controls.maxDistance = 4;
  controls.update(); // 카메라의 이동과 관련하여 변화가 있거나, 아니면 enableDamping값을 설정했다면 반드시 호출해줘야 함.

  // create black colored scene
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('black');

  // 지구본 텍스처를 로드해서 basic material을 만들고, 구체 지오메트리와 합쳐줘서 구체 메쉬를 만들어서 scene에 추가함.
  {
    const loader = new THREE.TextureLoader();
    /**
     * 여기서 텍스처를 로드한 뒤에 바로 render 함수를 호출하도록 코드를 작성했는데,
     * 왜 이렇게 했냐면 '불필요한 렌더링 삭제' 파트에서 배웠던 것처럼
     * 여기서도 카메라가 움직이거나 하지 않을 경우 불필요하게 render함수를 호출하지 않도록 만들거임.
     * 
     * 그런데 텍스처 로드는 시간이 좀 걸리는 작업인데, render 함수는 카메라가 움직이거나 맨 처음에만 호출하도록 한다면,
     * 만약에 텍스처가 다 로드되기도 전에 render 함수의 첫번째 호출이 이미 되어버렸다면?
     * 텍스처가 씌워지지 않은 지구본이 그대로 화면에 출력될 수밖에 없겠지?
     * 
     * 그래서 텍스처를 로드하고 나서 한번 더 render 함수를 호출해줘야 텍스처가 씌워진 지구본이 제대로 렌더가 되기 때문에
     * render 함수를 호출해주는 것.
     */
    const texture = loader.load('./image/world.jpg', render);
    const geometry = new THREE.SphereGeometry(1, 64, 32);
    const mateiral = new THREE.MeshBasicMaterial({
      map: texture
    });
    scene.add(new THREE.Mesh(geometry, mateiral));
  }

  // optimizing1에서 사용했던 그리드 형태의 인구 통계 데이터 url을 전달받아서 fetch로 response를 받고, 그거를 텍스트로 반환하는 함수
  async function loadFile(url) {
    const req = await fetch(url); // 이 부분을 비동기로 처리해 줌.
    return req.text(); // text()는 fetch의 response를 읽고 텍스트를 반환하는 메소드
  }

  // loadFile 함수에서 인구 통계 데이터를 텍스트로 반환받으면 해당 텍스트를 파싱해주는 함수
  function parseData(text) {
    const data = []; // 좌표 데이터를 push해서 담아놓을 빈 배열
    const settings = {
      data
    }; // settings 객체에 data: [] 이렇게 할당되어 있는 상태겠지
    let max;
    let min; // 각각 가장 큰 좌표데이터와 가장 작은 좌표데이터 값이 담기게 될 변수

    // split('\n')메소드는 전달받은 text string(튜토리얼 웹사이트에서 어떤 형태인지 참고)을 줄 단위로 끊은 문자열들을 배열에 담아 리턴해 줌.
    text.split('\n').forEach((line) => {
      // 줄 단위로 끊어진 문자열 배열에서 각각의 줄들을 인자로 전달하여 forEach를 실행해 줌.
      // line.trim()은 각 줄의 string에서 양 끝의 공백을 먼저 제거한 것.
      const parts = line.trim().split(/\s+/); // /\s+/은 정규표현식을 사용해서 각 줄을 공백을 기준으로 자르도록 구분자를 지정한 것.
      if (parts.length === 2) {
        // 문자열이 공백을 기준으로 2개로 나뉘어졌다면 키/값 쌍 데이터에 해당하겠지
        settings[parts[0]] = parseFloat(parts[1]); // parts[0]은 key, parts[1]은 value에 해당함. settings 오브젝트에 parts[0]이라는 키를 생성하여 거기에 parts[1] 문자열을 부동소수점 실수로 표현하여 할당하라는 뜻. 
      } else if (parts.length > 2) {
        // 공백을 기준으로 문자열이 2개 이상 나눠졌다면 좌표 데이터겠지
        // 각 좌표데이터들을 한줄씩 나눠놓은 것을 공백을 기준으로 쪼개서 담아놓은 배열이 parts잖아. 그러니 각 줄의 좌표데이터를 map()으로 돌면서 처리해주는거지.
        const values = parts.map((v) => {
          const value = parseFloat(v); // 좌표데이터 하나를 부동소수점 실수로 반환하여 value에 할당하고,

          if (value === settings.NODATA_value) {
            // 만약 value에 settings.NODATA_value의 값과 동일한 값이 할당되었다면(즉, -9999지? 좌표데이터 값이 없으면 -9999로 표현하라는 얘기임.)
            // map으로 새로 만들어서 반환해 줄 배열에 undefined를 리턴하고 다음 반복문으로 넘어감.
            return undefined;
          }

          // 만약 value가 -9999가 아닌 다른 값이 존재한다면, 먼저 max, min이 빈값이면 현재의 value를 할당하고(맨 처음 반복문에서 이렇게 하겠지), 
          // 그게 아니면 max, min에 각각 들어있는 자신의 값을 그대로 할당함. 그 상태에서 현재의 value와 max, min을 비교하여 각각 더 큰 값과 작은 값을 max, min에 각각 할당해줌.
          // 이렇게 하면 map을 전부 돌고 나면 -9999가 아닌 value값들 중에서 최대값은 max, 최소값은 min에 할당될거임
          max = Math.max(max === undefined ? value : max, value);
          min = Math.min(min === undefined ? value : min, value);

          return value; // 그리고 마지막으로 해당 value를 map으로 새로 만들어 반환해 줄 배열에 리턴하고 다음 반복문으로 넘어감.
        });

        data.push(values) // undefined 또는 부동소수점 실수값으로 표현된 좌표데이터들을 한줄 단위로 배열에 담아 data 배열에 push해놓음.
        // 왜? values 에는 parts안에 담긴 값으로 새로운 배열을 만들어 할당하는건데, parts는 한줄 단위로 끊긴 좌표데이터들이 들어가 있으니까!
      }
    });

    // Object.assign(대상 객체, 하나 이상의 출처 객체)
    // 이거는 뭐냐면, 말 그대로 대상 객체에 하나 이상의 출처 객체의 속성을 복사하여 넣어주는 기능을 함. 
    // 이렇게 하면 출처 객체의 속성값들이 복사되서 추가된 대상 객체가 리턴되는데, 
    // 결과적으로는 1. 데이터 파일의 키/값 쌍들(원래 대상 객체에 존재하던 속성들), 2. 좌표데이터(원래 대상 객체에 존재하던 속성들) 
    // 3. 가장 큰 좌표데이터와 가장 작은 좌표데이터값이 담긴 max, min 
    // 요렇게 세 개의 값이 담긴 객체를 리턴받게 된다는 뜻.
    return Object.assign(settings, {
      min,
      max
    });
  }

  // fileInfos의 각 fileInfo.file.data의 2차원 배열에서 latIndex, lonIndex로 접근한 값이 undefined라면 true를 리턴하여 makeBoxes()함수의 이중 forEach loop에서 if block을 들어가게 하고, 그게 아니면 false를 리턴해서 if block을 건너뛰게 함.
  function dataMissingInAnySet(fileInfos, latIndex, lonIndex) {
    for (const fileInfo of fileInfos) {
      if (fileInfo.file.data[latIndex][lonIndex] === undefined) {
        return true;
      }
    }

    return false;
  }

  // optimizing1에서 처럼 canvas에 점으로 표시하는 대신, 좌표 데이터마다 육면체를 생성하여 인구 데이터를 표시해줄 함수
  // 근데 optimizing1의 drawData()함수와 구조 자체는 유사함. 단지 캔버스에 점을 찍느냐, 박스를 그리냐의 차이.
  function makeBoxes(file, hueRange, fileInfos) {
    const {
      min,
      max,
      data
    } = file; // parseData에서 리턴받은 객체의 각각의 key와 value로 변수를 한번에 할당한 것.
    const range = max - min; // 가장 큰 좌표데이터값에서 가장 작은 좌표데이터값을 뺀 범위값

    // 헬퍼 Object3D들을 만들어서 각 박스 메쉬들의 전역 공간상의 좌표값을 쉽게 구할 수 있도록 한거임.
    const lonHelper = new THREE.Object3D();
    scene.add(lonHelper); // 얘를 y축으로 회전시켜서 경도(longitude)를 맞춤

    const latHelper = new THREE.Object3D();
    lonHelper.add(latHelper); // 얘를 x축으로 회전시켜서 위도(latitude)를 맞춤

    const positionHelper = new THREE.Object3D();
    positionHelper.position.z = 1;
    latHelper.add(positionHelper); // 얘는 다른 요소들의 기준축을 구체의 끝에 맞추는 역할을 함.

    // 박스 메쉬들의 중심을 옮겨서 양의 z축 방향으로 커지게함
    const originHelper = new THREE.Object3D();
    originHelper.position.z = 0.5;
    positionHelper.add(originHelper);

    // 지오메트리의 각 vertex에 할당할 색상값을 담아놓을 Color 객체를 만들어놓음.
    const color = new THREE.Color();

    const lonFudge = Math.PI * 0.5; // 90도
    const latFudge = Math.PI * -0.135; // 이 각도들은 각각 lonHelper, latHelper의 회전 각도를 구할 때 사용됨.

    // optimizing_2 예시에서는 메쉬들을 각각 만들어서 총 19000개의 메쉬들이 생성했지만,
    // 이렇게 메쉬들이 많으면 연산요청도 많아져서 프레임이 상당히 버벅거림 내 컴에서 20fps 정도 밖에 안나옴.
    // 그래서 어떻게 할거냐면, 각 육면체 별로 geometry를 19000개 따로 만든 뒤, 얘내들을 merge해서 하나의 geometry로 합칠 수 있음.
    // 이렇게 하나로 합쳐진 geometry와 mateiral을 이용해서 하나의 mesh로 만들면 연산요청이 19000회에서 1회로 줄어드니까
    // 버벅임이 훨씬 덜하겠지! 그래서 일단 19000개의 지오메트리들을 만들어서 담아놓을 배열을 준비해놓은거임.
    const geometries = [];

    data.forEach((row, latIndex) => {
      row.forEach((value, lonIndex) => {
        if (dataMissingInAnySet(fileInfos, latIndex, lonIndex)) {
          // 만약 좌표데이터값이 undefined이면 아무것도 하지 않고 바로 다음 반복문으로 넘겨버림.
          return;
        }

        // 좌표데이터값이 undefined가 아니라면, 아래의 내용들을 실행해 줌.
        const amount = (value - min) / range;

        // 이중 forEach loop에서 좌표데이터가 존재하는 위, 경도 각각마다 geometry를 따로 생성해놓음.
        const boxWidth = 1;
        const boxHeight = 1;
        const boxDepth = 1;
        const geometry = new THREE.BoxGeometry(boxWidth, boxHeight, boxDepth);

        // 헬퍼들을 특정 위도와 경도로 회전시킴
        lonHelper.rotation.y = THREE.MathUtils.degToRad(lonIndex + file.xllcorner) + lonFudge;
        latHelper.rotation.x = THREE.MathUtils.degToRad(latIndex + file.yllcorner) + latFudge;

        // positionHelper에서 사이즈값을 amount값에 따라서 달리 조정한 뒤,
        // 그것의 자식노드인 originHelper의 전역공간의 변환행렬(scale, rotation, position 등 모든 게 담긴 4*4 행렬)을 최종적으로 각 geometry의 변환행렬로 적용함.
        // 이 originHelper의 전역공간의 변환행렬(matrixWorld)에는 부모의 부모의 부모노드와 부모의 부모노드인 lonHelper, letHelper의 회전, 부모노드인 positionHelper의 사이즈 조정이 반영되어 있음! 
        positionHelper.scale.set(0.005, 0.005, THREE.MathUtils.lerp(0.01, 0.5, amount)); // x, y방향의 scale은 1 -> 0.005로 줄인 값으로 통일하고, z방향의 scale은 amount값에 따라 0.01 ~ 0.5 사이의 값으로 줄여줌.
        originHelper.updateWorldMatrix(true, false); // 부모노드들에 의해 전역공간의 변환행렬의 바뀐 값을 업데이트해줌.
        geometry.applyMatrix4(originHelper.matrixWorld); // originHelper의 전역공간 변환행렬을 각 geometry의 변환행렬로 적용해버림

        // 각 지오메트리의 vertex에 적용할 색상값을 hsl로 계산한 뒤, 그거를 rgb값의 배열로 변환해줌.
        const hue = THREE.MathUtils.lerp(...hueRange, amount); // 각 fileInfo 객체에 저장된 hueRange 배열안에 존재하는 hue의 최솟값, 최댓값을 하나하나씩 복사하여 lerp메소드에 전달해주는 거임.
        const saturation = 1;
        const lightness = THREE.MathUtils.lerp(0.4, 1.0, amount);
        color.setHSL(hue, saturation, lightness);
        // Color.toArray()는 [r, g, b] 요렇게 rgb값이 담긴 배열 형태로 색상값을 리턴해주는 메소드임. 
        // 근데 이 Color 객체의 속성값인 r, g, b는 0 ~ 1사이의 값으로 할당되어 있기 때문에, 이거를 0 ~ 255사이의 값으로 변환하기 위해서 각각의 값에 255씩 곱한 값들을 리턴하여 새로운 배열로 만들어서 const rgb에 할당해준거임.
        const rgb = color.toArray().map(v => v * 255);

        // 각 육면체 지오메트리의 vertex 수(36) * rgb 수(3)를 배열의 길이로 갖는 형식화배열을 생성해 줌.
        const numVerts = geometry.getAttribute('position').count; // geometry.getAttribute('position')는 해당 geometry의 각 vertex의 Vector3 위치값이 담긴 배열을 리턴할거고, geometry.getAttribute('position').count는 그 배열에 담긴 Vector3의 개수를 리턴해준다고 함.
        const itemSize = 3; // r, g, b
        const colors = new Uint8Array(itemSize * numVerts); // 36 * 3 개의 배열 길이를 갖는 형식화 배열

        // 형식화 배열을 forEach loop로 돌리면서
        // 각 vertex 하나당 r, g, b 값들을 반복적으로 저장함으로써, 형식화 배열에는 각 vertex에 똑같은 r,g,b값들이 반복적으로 지정될거임.
        colors.forEach((v, index) => {
          colors[index] = rgb[index % 3]; // rgb[]에 들어가는 인덱스값은 3으로 나눈 나머지니까 0, 1, 2중에 하나만 들어가겠지. 그니까 r, g, b값이 반복적으로 할당된다는 뜻임.
        });

        // BufferAttribute는 BufferGeometry와 연관된 속성들(컬러, 위치값, 노말, uv 등등)에 대한 데이터를 형식화 배열로 받아서 저장하는 클래스임.
        // 이렇게 BufferAttribute를 미리 만들어놓고 geometry.setAttribute('attributeName', BufferAttribute) 이렇게 지오메트리 속성에 할당해주면 gpu에 데이터를 더 효율적으로 전달할 수 있다고 함.
        // BufferAttribute(array : TypedArray, itemSize : Integer, normalized : Boolean)에서 itemSize는 지오메트리의 버텍스 하나당 할당해줘야 하는 값의 개수를 의미한다고 함.
        const normalized = true;
        const colorAttribute = new THREE.BufferAttribute(colors, itemSize, normalized);
        geometry.setAttribute('color', colorAttribute); // 이렇게 하면 각 지오메트리의 vertex들에 각각의 color값이 지정된거임. 물론 하나의 지오메트리 내부의 vertex들은 모두 동일한 색상값이 지정되었겠지?

        geometries.push(geometry) // 따로 생성한 geometry들을 넣어줌.
      });
    });

    // 생성한 geometry들을 BufferGeometryUtils안에 있는 mergeBufferGeometry를 이용해서 하나로 합쳐버림.
    // 이 때 BufferGeometryUtils도 OrbitControls처럼 THREE와 파일 위치가 다르기 때문에 따로 불러와야 함.
    return BufferGeometryUtils.mergeBufferGeometries(geometries, false); // geometry들이 담긴 배열을 전달하고, 병합된 지오메트리들의 그룹을 생성할 지 여부를 boolean값으로 전달함.
  }

  // 각 fileInfo의 url을 loadFile()함수에 전달해서 텍스트를 리턴받고, 그거를 파싱해서 각 fileInfo에 file이라는 key를 만들어서 거기에 할당해 줌.
  async function loadData(info) {
    const text = await loadFile(info.url);
    info.file = parseData(text);
  }

  // fileInfos안에 남/녀로 나뉜 인구통계 데이터 url 및 버텍스에 지정할 색상의 hue값 범위를 지정하고, 비동기로 loadData를 각각의 info에 실행할거임.
  async function loadAll() {
    // 남/녀 인구통계로 나눠진 데이터의 url을 저장해놓음
    const fileInfos = [{
        name: 'men',
        hueRange: [0.7, 0.3],
        url: 'https://threejsfundamentals.org/threejs/resources/data/gpw/gpw_v4_basic_demographic_characteristics_rev10_a000_014mt_2010_cntm_1_deg.asc'
      },
      {
        name: 'women',
        hueRange: [0.9, 1.1],
        url: 'https://threejsfundamentals.org/threejs/resources/data/gpw/gpw_v4_basic_demographic_characteristics_rev10_a000_014ft_2010_cntm_1_deg.asc'
      },
    ];

    // Promise.all(Array와 같은 순회 가능한 객체) 는 순회 가능한 객체에 주어진 모든 프로미스를 이행한 후 Promise를 리턴해 줌.
    await Promise.all(fileInfos.map(loadData)); // fileInfos에 담긴 객체들을 loadData 함수로 각각 실행한 결과를 모은 배열을 전달하는 것. 각각에 file 속성이 추가되어 있겠지

    // 2차원 배열(배열 속 배열)을 받아서 겉에 배열과 안의 각각의 배열들을 map으로 처리하는 함수.
    function mapValue(data, fn) {
      // 이 함수는 결과적으로 바깥의 map에서 새로 만들어주는 배열을 리턴함.
      return data.map((row, rowIndex) => {
        return row.map((value, colIndex) => {
          return fn(value, rowIndex, colIndex); // 이 mapValue 함수는 배열 속 배열의 각 value들(일종의 위,경도 좌표에 해당하는 value지)에 대해서 전달받은 함수로 뭔가를 실행해서 그 결과값을 리턴해 줌.
        });
      });
    }

    // baseFile과 otherFile을 비교해서 새로운 파일을 만듦. (남(base)/여 또는 여(base)/남을 비교해서 남 - 여 또는 여 - 남 값들이 담긴 file 객체를 리턴해 줌)
    function makeDiffFile(baseFile, otherFile, compareFn) {
      let min;
      let max; // 각각 남 - 여 또는 여 - 남의 최솟값, 최댓값을 저장할 변수

      const baseData = baseFile.data; // 이 file.data는 parseData함수에서 fileInfo를 처리하면 생기는 배열임. loadData에서 리턴받은 text들에 대해서 parseData를 호출했으니 당연히 각 info.file에 존재하는 배열이겠지?
      const otherData = otherFile.data;

      // baseData와 같이 전달하는 익명함수는 mapValue(data, fn)에서 fn자리에 인자로 전달해주는 함수임.
      // 얘는 이중 mapping의 가장 안쪽에서 value, rowIndex, colIndex를 전달하면서 호출해 줌.
      const data = mapValue(baseData, (base, rowIndex, colIndex) => {
        const other = otherData[rowIndex][colIndex]; // mapValue에서 이중으로 mapping하는 과정에서 전달한 rowIndex, colIndex를 또다른 2차원 배열인 otherData에서 사용하여 값을 참조해 other에 할당해놓음. 
        if (base === undefined || other === undefined) {
          // 2차원배열인 baseData 또는 otherData 에 동일한 인덱스로 접근했을 때 둘 중 하나라도 값이 undefined라면 undefined를 리턴해주고 mapValue 함수 내에서 다음 map loop로 넘김 
          return undefined;
        }

        // 둘 다 undefined가 아니라면 아래의 내용을 실행함
        const value = compareFn(base, other); // makeDiffFile()함수를 호출할 때 전달해줬던 compareFn에서는 base - other 뺀 값이 0보다 크면 리턴해주고, 0보다 작으면 0을 리턴해줄거임.
        min = Math.min(min === undefined ? value : min, value);
        max = Math.max(max === undefined ? value : max, value); // 각각 현재의 value와 비교하여 최댓값과 최솟값을 추적하여 구해줌.
        return value;
      });

      // mapValue를 호출해서 바깥 쪽 map이 새로 만들어준 배열에는 1. 값이 없는 곳은 undefined, 2. 값이 있는데 base > other이면 base - other한 값, 3. 값이 있는데 base < other이면 0 이 셋중에 하나가 들어있는 배열을 const data에 리턴해 줌.
      // 기본적으로 baseFile(남 또는 여 인구통계 데이터가 담긴 file 객체)를 하나하나 복사하여 할당한 뒤, key값이 min, max, data로 동일한 애들은 makeDiffFile 함수를 돌면서 구한 값들로 덮어써서 새 값으로 교체된 file 객체를 리턴해 줌.
      return {
        ...baseFile,
        min,
        max,
        data
      };
    }

    // fileInfos에 들어있는 객체들에 새로운 fileInfo들을 만들어줄거임. 물론 각 객체들의 file 속성에는 makeDiffFile 함수를 호출해서 그 결과값을 리턴받아서 할당해줄거고...
    {
      const menInfo = fileInfos[0];
      const womenInfo = fileInfos[1];
      const menFile = menInfo.file;
      const womenFile = womenInfo.file; // 각 fileInfo 객체들의 file속성값만 할당해줘서 얘내들을 makeDiffFile 함수를 호출할 때 같이 전달해줌으로써 새로운 fileInfo객체를 만들 때 file 속성값에 할당할 file 객체를 리턴받아올거임.

      function amountGreaterThan(a, b) {
        return Math.max(a - b, 0);
      }

      // 새로운 fileInfo 객체를 2개 만들어서 fileInfos에 넣어줌. 각각 (남 - 여 인구통계 데이터, 여 - 남 인구통계 데이터)
      fileInfos.push({
        name: '>50% men', // 남자의 인구가 더 많은 지역에 남 - 여 인구데이터를 육면체로 표현해줄거임
        hueRange: [0.6, 1.1], // 각 육면체 지오메트리의 버텍스에 지정할 색상값 범위도 다르게 설정해 줌.
        // 같이 전달해주는 익명함수가 makeDiffFile에 전달하는 compareFn임. 이 때, makeDiffFile함수 내에서 compareFn의 첫번째 인자는 base, 두번째 인자는 other값으로 계산될거임.
        file: makeDiffFile(menFile, womenFile, (men, women) => {
          return amountGreaterThan(men, women);
        })
      });
      fileInfos.push({
        name: '>50% women',
        hueRange: [0.0, 0.4],
        file: makeDiffFile(womenFile, menFile, (women, men) => {
          return amountGreaterThan(women, men);
        })
      });
    }

    // makeBoxes 함수를 이용해서 각각의 fileInfo 객체들로부터 병합된 지오메트리를 만들어 리턴받고, 걔내들로 새로운 배열을 만들어서 geometries에 할당함
    const geometries = fileInfos.map((info) => {
      return makeBoxes(info.file, info.hueRange, fileInfos);
    });

    // geometries에 담긴 첫번째 병합 지오메트리, 즉 남성 인구통계 지오메트리를 기준으로 다른 지오메트리들을 morphTargets로 지정함
    const baseGeometry = geometries[0];
    // Geometry.morphAttributes는 해당 지오메트리의 morph targets에 관한 자세한 BufferAttributes들을 가지고 있음. 이중에 position에 다른 지오메트리들의 position attribute 배열을 할당하려는 것.
    baseGeometry.morphAttributes.position = geometries.map((geometry, index) => {
      const attribute = geometry.getAttribute('position'); // 각 지오메트리의 position Attribute를 가져와서 attribute에 할당해놓기
      const name = `target${index}`;
      attribute.name = name; // 각 지오메트리의 position attribute의 name 속성에 target0, 1, 2, 3 이런식으로 각각 넣어줌.

      return attribute; // 이렇게 이름도 새로 지정한 각각의 지오메트리들의 position attribute들만 모아 새로운 배열을 만들어서 baseGeometry.morphAttribute.position에 할당해 줌.
    });

    // 각 병합된 지오메트리들의 BufferAttribute로부터 색상값을 추출함
    const colorAttributes = geometries.map((geometry, index) => {
      const attribute = geometry.getAttribute('color');
      const name = `morphColor${index}`;
      attribute.name = `color${index}`;

      // 각 지오메트리의 color Attribute와 임의로 지은 name을 묶어서 리턴받은 객체로 새로운 배열을 만들어 colorAttributes에 할당해놓음.
      return {
        name,
        attribute
      };
    });

    const material = new THREE.MeshBasicMaterial({
      vertexColors: true, // 각 지오메트리의 버텍스에 지정된 색상값으로 메쉬 안의 해당 지오메트리 영역만 그 색상값으로 렌더해주는 옵션
      morphTargets: true // 현재 basic material이 morphTargets를 사용할 것인지를 정의해 줌. 
    });

    // three.js의 내장 쉐이더를 수정해야 함. Material.onBeforeCompile 속성에 어떤 함수를 지정하면 
    // WebGL에 쉐이더를 올리기 전에 material의 쉐이더를 수정할 수 있음. 
    // 우선 예제에 필요한 쉐이더 묶음들을 교체할 수 있는 배열을 만듦.
    const vertexShaderReplacements = [{
        from: '#include <morphtarget_pars_vertex>',
        to: `
          uniform float morphTargetInfluences[8];
        `,
      },
      {
        from: '#include <morphnormal_vertex>',
        to: `
        `,
      },
      {
        from: '#include <morphtarget_vertex>',
        to: `
          transformed += (morphTarget0 - position) * morphTargetInfluences[0];
          transformed += (morphTarget1 - position) * morphTargetInfluences[1];
          transformed += (morphTarget2 - position) * morphTargetInfluences[2];
          transformed += (morphTarget3 - position) * morphTargetInfluences[3];
        `,
      },
      {
        from: '#include <color_pars_vertex>',
        to: `
          varying vec3 vColor;
          attribute vec3 morphColor0;
          attribute vec3 morphColor1;
          attribute vec3 morphColor2;
          attribute vec3 morphColor3;
        `,
      },
      {
        from: '#include <color_vertex>',
        to: `
          vColor.xyz = morphColor0 * morphTargetInfluences[0] +
                       morphColor1 * morphTargetInfluences[1] +
                       morphColor2 * morphTargetInfluences[2] +
                       morphColor3 * morphTargetInfluences[3];
        `,
      },
    ];

    // 그 다음 위의 교체용 배열을 이용해서 material의 쉐이더 중 vertexShader에서 교체하고자 하는 쉐이더 묶음(rep.from)과 뭘로 교체할건지(rep.to)를 전달해서 각각의 shader 묶음을 교체해주는 함수를 onBeforeComplie에 지정해 줌.
    material.onBeforeCompile = (shader) => {
      vertexShaderReplacements.forEach((rep) => {
        shader.vertexShader = shader.vertexShader.replace(rep.from, rep.to);
      });
    }

    const mesh = new THREE.Mesh(baseGeometry, material); // baseGeometry만 가지고 메쉬를 생성함. 이제 이 baseGeometry에 설정된 morphTarget을 이용해서 Tween라이브러리로 mesh에 전환효과를 줘서 바꿔줄거임
    scene.add(mesh);

    // 이 함수는 mesh.morphTargetInfluences를 정렬해서 그 중 가장 높은 influence 값을 가진 morphtarget의 attribute로만 할당하는거 같은데 설명이 하나도 이해가 안간다ㅠ 내일 다시 봐야 할거같음...
    function updateMorphTargets() {
      for (const {
          name
        } of colorAttributes) {
        baseGeometry.deleteAttribute(name); // 전달받은 const name을 name 속성값으로 갖는 속성들(즉, color attribute)들을 모두 제거한다고 함. 얘를 왜 하는거지>
      }

      const maxInfluences = 8; // 이것도 뭐에 쓰는건지 모르겠음ㅋㅋㅋ 아마도 morphTargetInfluences를 정렬하면서 내림차순으로 정렬된 influence값들중에서 상위 9개의(인덱스가 8이니까) 값 까지만 slice해서 return하려는 거 같은데...ㅠ

      mesh.morphTargetInfluences
        .map((influence, i) => [i, influence])
        .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])) // 각 b[1], a[1]은 influence값들을 의미하고, 얘내들을 뺀 값이 0보다 크면 b가 앞으로 가고, 작으면 a가 앞으로 가서 influence를 기준으로 내림차순으로 정렬된 배열이 리턴됨
        .slice(0, maxInfluences) // 9번째로 큰 influence값들 까지만 자름
        .sort((a, b) => a[0] - b[0]) // 얘는 a[0], b[0]이 각각 i값이니까 인덱스값끼리 비교한거고, 인덱스를 기준으로 오름차순으로 다시 정렬한거임
        .filter(a => !!a[1]) // !!어떤값 이렇게 선언하면, '어떤값'이 단지 true냐, false냐 boolean으로 나타내주기 위해 사용하는 연산자라고 보면 됨. 즉, influence값이 없는 요소, 즉 0인 요소를 필터링해서 새로운 배열로 만듦.
        .forEach(([index], i) => { // 아니 forEach에 누가 [index] 이런식으로 요소를 전달하지? 진짜 이 튜토리얼은 별의 별 난생 처음보는 문법들만 골라서 쓰고있네...
          const name = `morphColor${i}`;
          baseGeometry.setAttribute(name, colorAttributes[index].attribute);
        });
    }

    // mouseover이벤트를 받아서 선택된 데이터의 병합된 메쉬를 보여주고, 나머지는 감춰주는 함수
    function showFileInfo(fileInfos, fileInfo) {
      fileInfos.forEach((info) => {
        // mouseover이벤트를 받은 fileInfo 객체를 fileInfos안에 있는 모든 객체들과 일일이 비교해서 해당하는 fileInfo 객체를 찾았다면 visible을 true로, 아닌 경우는 모두 false로 할당될거임.
        const visible = fileInfo === info;
        // 아래에서 showFileInfo 함수를 호출하기 전 div태그를 생성해서 각 fileInfo 들에 elem 키를 만들어서 할당해 줌. 그 div 태그들에 visible값에 따라 'selected'라는 클래스명을 붙여줄 지 지워줄 지 결정함.
        info.elem.className = visible ? 'selected' : '';

        const targets = {}; // 각 fileInfo 객체별로 애니메이션으로 도달할 목표 influence값이 저장됨.
        fileInfos.forEach((info, i) => {
          // mouseover 이벤트가 발생하여 전달받은 fileInfo 객체와 동일한 info 객체가 있다면 그 객체의 인덱스를 key, 값은 1로 하여 해당 info 객체의 목표 influence값을 할당하고, 나머지는 info객체의 목표 influence는 0으로 할당해버림.
          targets[i] = info === fileInfo ? 1 : 0;
        });
        const durationInMs = 1000; // influence 속성의 애니메이션을 1초(1000ms)동안 지속할 예정
        // Mesh.morphTargetInfluences는 0 ~ 1 사이의 가중치가 담긴 배열로, morph가 적용되는 정도를 지정한다고 함. 그니까 mesh의 현재 influence값이 담긴 배열에서 Tween 애니메이션을 시작한다는거임.
        // new TWEEN.Tween(mesh.morphTargetInfluences)
        tweenManager.createTween(mesh.morphTargetInfluences) // 헬퍼 클래스로 생성한 인스턴스의 createTween메소드를 이용해서 Tween 인스턴스를 생성하도록 함.
          .to(targets, durationInMs) // .to는 아마도 TWEEN 라이브러리의 메소드같은데, 현재 mesh의 morphTargetInfluences를 목표 influence값에 durationInMs 시간동안 도달하도록 애니메이션을 주는거같음.
          .start(); // 애니메이션을 시작하라는 거 같음. 그럼 mouseover 이벤트를 받아서 showFileInfo를 호출하는 순간 Tween이 각각의 influence값에 애니메이션을 주겠네
      });
      requestAnimateIfNotRequested(); // 각 병합된 4개의 mesh들의 Object3D(Mesh).visible 속성을 바꿔줬으니 render 함수를 호출해서 다시 렌더해줘야 함.
    }

    // mouseover 이벤트를 받아 선택하는 ui를 만들고, addBoxes를 호출하여 각 fileInfo 객체별로 병합된 mesh를 만든 뒤, 각 fileInfo 객체에 넣어줌.
    const uiElem = document.querySelector('#ui');

    fileInfos.forEach((info) => {
      const div = document.createElement('div');
      info.elem = div; // div태그도 만들어서 각각 fileInfo 객체의 elem키를 만들어서 할당해 줌.
      div.textContent = info.name; // ui로 활용할 div에 각 fileInfo 객체의 name속성값을 텍스트로 넣어줌

      uiElem.appendChild(div); // ui 요소들을 감싸는 부모 태그에 각각 append 해줌

      div.addEventListener('mouseover', () => {
        showFileInfo(fileInfos, info); // 각 div에 mouseover 이벤트가 발생하면 해당 div태그가 info.elem에 들어가있는 info를 전달하면서 showFileInfo를 호출함.
      });
    });

    // 일단 페이지가 로드되면 mouseover 이벤트를 받지 않더라도 첫번째 fileInfo 객체의 병합된 메쉬를 먼저 렌더링해줌.
    showFileInfo(fileInfos, fileInfos[0]);

    return updateMorphTargets; // loadAll 내부에서 정의한 이 함수를 마지막에 리턴해줌.
  }

  // loadAll()을 호출해서 데이터를 불러오기 전까지는 빈 함수를 실행하다가 
  let updateMorphTargets = () => {};
  // loadAll()함수에서 마지막으로 updateMorphTargets 함수를 리턴해주면 그거를 fn으로 받아와서 updateMorphTargets 변수에 할당해줘서 updateMorphTargets 함수를 호출하는거지.
  loadAll().then(fn => {
    updateMorphTargets = fn;
  });

  // resize renderer
  function resizeRendererToDisplaySize(renderer) {
    const canvas = renderer.domElement;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const needResize = canvas.width !== width || canvas.height !== height;
    if (needResize) {
      renderer.setSize(width, height, false);
    }
    return needResize;
  }

  // OrbitControls.update()에 의해서 render를 호출하려는건지, 
  // 아니면 실제로 change 이벤트나 resize 이벤트에 의해서 render를 호출하려는건지 구분해주는 변수
  let renderRequested = false;

  // render
  function render() {
    renderRequested = undefined; // renderRequested를 초기화함

    // 렌더러가 리사이즈되면 씬을 담는 카메라의 비율도 캔버스 비율에 맞게 업데이트되어야 함
    if (resizeRendererToDisplaySize(renderer)) {
      const canvas = renderer.domElement;
      camera.aspect = canvas.clientWidth / canvas.clientHeight;
      camera.updateProjectionMatrix();
    }

    // tweenManager.numTweensRunning값이 1이면 update() 메소드가 true를 리턴해줘서 if block을 통과하니까 render 함수를 계속 호출할거고,
    // 0이면 update()메소드가 false를 리턴해서 if block을 통과하지 못하니까 render함수는 호출되지 않고 렌더링 루프를 반복하지 않을거임.
    if (tweenManager.update()) {
      requestAnimateIfNotRequested();
    }

    updateMorphTargets(); // tweenManager.update()로 업데이트해주고 나서 renderer.render()메서드를 호출하기 전 이 함수를 호출해줘야 한다고 함.

    // 카메라의 transform에 변화가 있다면 반드시 호출해줘야 함.
    // 근데 얘를 호출하는 것 자체가 OrbitControls에 'change'이벤트를 보내는거기 때문에
    // requestAnimateIfNotRequested 함수 재호출로 인하여, render함수 내에서 render함수를 중복 호출할 우려가 있음.
    // 이 때 update()에 의한 것이 아니라, OrbitControls에서 실제로 change 이벤트를 받거나, 브라우저에서 resize이벤트를 받음으로 인해서
    // render함수를 호출했을 때 이미 renderRequested가 true상태이기 때문에, requestAnimateIfNotRequested가 재호출되어도
    // if block 안쪽으로 들어가지 못하기 때문에 render 함수를 중복 호출하는걸 방지할 수 있음.
    controls.update();

    renderer.render(scene, camera);
  }
  render();

  function requestAnimateIfNotRequested() {
    if (!renderRequested) {
      renderRequested = true;
      requestAnimationFrame(render);
    }
  }

  controls.addEventListener('change', requestAnimateIfNotRequested);
  window.addEventListener('resize', requestAnimateIfNotRequested);
}

main();