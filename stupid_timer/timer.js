let totalSeconds = 0;
let lastTick = 0;
let size;
let mjY;
let mjSpeed = 2;
let stop = false;
let soundPlayed = false;
let lastBgChange = 0;
let stop_bg_duration = 500;

function preload() {
  imgLeon = loadImage("leon.png");
  imgMarcela = loadImage("marcela.png");
  mj_leon = loadImage("mj_leon.png");
  mj_marcela = loadImage("mj_marcela.png");
  stopMusic = loadSound("stop.MP3");
}

function setup() {
  createCanvas(windowWidth, windowHeight);
  size = width / 6;
  textSize(size);
  textAlign(CENTER, CENTER);
  textFont("Comic Relief");
  stopMusic.setLoop(false);
  mjY = 1.5 * height;
  bgColor = color(240);

  // read
  const rawH = sessionStorage.getItem('selH');
  const rawM = sessionStorage.getItem('selM');
  const rawS = sessionStorage.getItem('selS');

  const h = (rawH === 'Leon' || rawH === 'Marcela') ? 0 : parseInt(rawH) || 0;
  const m = (rawM === 'Leon' || rawM === 'Marcela') ? 0 : parseInt(rawM) || 0;
  const s = (rawS === 'Leon' || rawS === 'Marcela') ? 0 : parseInt(rawS) || 0;
  
  console.log(h, m, s);

  totalSeconds = h*3600 + m*60 + s;
  lastTick = millis();
}


function draw() {
  background(bgColor);
  //image(mj_leon, width/3, height/2, size*2, size*2);

  // by second
  if (millis() - lastTick >= 1000) {
    totalSeconds = max(0, totalSeconds - 1);
    lastTick = millis();
  }

  sessionStorage.removeItem('selH');
  sessionStorage.removeItem('selM');
  sessionStorage.removeItem('selS');


  // count time
  let hh = floor(totalSeconds / 3600);
  let mm = floor((totalSeconds % 3600) / 60);
  let ss = totalSeconds % 60;

  let disp = nf(hh,2) + ':' + nf(mm,2) + ':' + nf(ss,2);


  push();
  fill(20,100);
  textSize(size * 0.1);
  text("Press Enter to Reset", width/2, height/6);
  pop();


  // end
  if (totalSeconds <= 0) {

    if(millis() - lastBgChange >= stop_bg_duration){
      let bgc1 = random(0, 255);
      let bgc2 = random(0, 255);
      let bgc3 = random(0, 255);
      bgColor = color(bgc1, bgc2, bgc3);
      lastBgChange = millis();
    }

    fill(200,0,0);
    textSize(size);
    text("Time's up!", width/2, height/2);
    if(soundPlayed == false){
      stopMusic.play();
    }
    soundPlayed = true;
    //noLoop();
    stop = true;
  }else{
    fill(0,0,0);
    textSize(size);
    text(disp, width/2, height/2);
  }

  if(stop == true){
    mjY -= mjSpeed;
    image(mj_leon, width/30, mjY, size*2, size*2);
    image(mj_marcela, width/1.6, mjY, size*2, size*2);
    if(mjY <= height/3 || mjY >= height * 1.5){
      mjSpeed = -mjSpeed;
    }
  }
}

function keyPressed() {
  if (key === 'F' || key === 'f') {
    fullscreen(!fullscreen());
  }
  if (key === 'Enter') {
    noLoop(); 
    setTimeout(() => {
      location.replace('index.html');
    }, 50);
  }

}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  size = width / 6;
  textSize(size);
}
