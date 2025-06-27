let size;
let hours   = [0,1,2,99,6,"Leon",3,5,4,67,4,"Marcela",20,7,8,9,10,4,11,12,4,34,13];
let minutes = [0,20,10,30,5,"Marcela",35,45,3,40,57,4,30,"Leon",15,25,11,12,34,13];
let seconds = [0,1,2,75,88,3,"Marcela",6,5,4,39,"Leon",20,7,8,9,10,11,12,34,13];

let imgLeon, imgMarcela, soundWee;
let offsets = {h:0, m:0, s:0};
let startY=0, startOffset=0, active=null;
let lastPlayed={h:null,m:null,s:null};

let LeonX=[], LeonY=[], LeonSz=[];
let MarcX=[], MarcY=[], MarcSz=[];

// about spin
let spinning = false;
let spinVel = {h:0,m:0,s:0};
const friction = 0.98;

function preload() {
  imgLeon    = loadImage('leon.png');
  imgMarcela = loadImage('marcela.png');
  soundWee   = loadSound('wee.wav');
}

function setup() {
  createCanvas(windowWidth, windowHeight);
  size = width/7;
  textFont('Comic Relief');
  textSize(size);
  textAlign(CENTER,CENTER);
  imageMode(CENTER);
  soundWee.setLoop(false);
}

function draw() {
  background(200);
  let cols  = [width/6, width/2, width*5/6];
  let lists = [hours, minutes, seconds];
  let keys  = ['h','m','s'];

  // spin with loop
  if (spinning) {
    for (let k of keys) {
      offsets[k] -= spinVel[k];
      spinVel[k] *= friction;
      let arrLen = lists[keys.indexOf(k)].length;
      let cycle = arrLen * size;
      offsets[k] = ((offsets[k] % cycle) + cycle) % cycle;
    }
  }


  // 3 columns
  for (let i=0; i<3; i++) {
    let key = keys[i], arr = lists[i], x = cols[i], off = offsets[key];
    let idx = constrain(round(-off/size), 0, arr.length-1);
    let sel = arr[idx];

    // sunflower Leon&Marcela, Wee sound
    if ((sel==='Leon'||sel==='Marcela') && lastPlayed[key]!==sel) {
      soundWee.play();
      lastPlayed[key] = sel;
      spawnArray(sel, x);
    }
    if (typeof sel==='number') lastPlayed[key]=null;

    push(); translate(x,0); noStroke();
    let cycle = arr.length * size;
    for (let m=-1; m<=1; m++) {
      for (let j=0; j<arr.length; j++) {
        let y = height/2 + j*size + off + m*cycle;
        if (y>-size && y<height+size) {
          if (arr[j]==='Leon')      image(imgLeon,0,y,size*0.9,size*0.9);
          else if (arr[j]==='Marcela') image(imgMarcela,0,y,size*0.9,size*0.9);
          else {
            fill(j===idx?[200,0,0]:[0]);
            textSize(size);
            text(arr[j], 0, y);
          }
        }
      }
    }
    pop();

    // cover
    push();
    fill(200,200);
    noStroke();
    rect(x-width/6, 0, width/3, height/2 - size/2);
    rect(x-width/6, height/2 + size/2, width/3, height);
    pop();

    // lines, circles, and H&M
    noStroke(); fill(0);
    rect(0,0,width/50,height);
    rect(width/3,0,width/50,height);
    rect(2*width/3,0,width/50,height);
    rect(49*width/50,0,width/50,height);
    circle(width/2.92, height/2.05, size*0.8);
    circle(2.03*width/3, height/2.05, size*0.8);
    fill(255); textSize(size*0.7);
    text('H', width/2.92, height/2);
    text('M', 2.03*width/3, height/2);

    // text hints
    push();
    fill(0,100);
    textSize(size*0.1);
    text("Press Enter to Start", width/2, height * 0.9);
    text("Press Space to Spin", width / 2, height * 0.85);
    pop();
  }

  // falling sunflower Leon and Marcela XD
  let factor = 0.1;
  for (let i=LeonX.length-1; i>=0; i--) {
    LeonY[i] += LeonSz[i]*factor;
    image(imgLeon, LeonX[i], LeonY[i], LeonSz[i], LeonSz[i]);
    if (LeonY[i] > height+LeonSz[i]) LeonX.splice(i,1),LeonY.splice(i,1),LeonSz.splice(i,1);
  }
  for (let i=MarcX.length-1; i>=0; i--) {
    MarcY[i] += MarcSz[i]*factor;
    image(imgMarcela, MarcX[i], MarcY[i], MarcSz[i], MarcSz[i]);
    if (MarcY[i] > height+MarcSz[i]) MarcX.splice(i,1),MarcY.splice(i,1),MarcSz.splice(i,1);
  }
}

function spawnArray(type, x) {
  for (let i=0; i<15; i++) {
    let sz = random(size*0.8, size*1.5);
    let y0 = -sz;
    let x0 = x + random(-size/4, size/4);
    if (type==='Leon') LeonX.push(x0),LeonY.push(y0),LeonSz.push(sz);
    else              MarcX.push(x0),MarcY.push(y0),MarcSz.push(sz);
  }
}

function mousePressed() {
  if (mouseX < width/3) {
    active = 'h';
  } else if (mouseX < 2*width/3) {
    active = 'm';
  } else {
    active = 's';
  }
  startY      = mouseY;
  startOffset = offsets[active];
}


function mouseDragged() {
  if (active) {
    let dy = mouseY - startY;
    offsets[active] = startOffset + dy;
  }
}


function mouseReleased() {
  if (active) {
    let arr = active === 'h' ? hours
            : active === 'm' ? minutes
            : seconds;
    let rawIdx = round(-offsets[active] / size);
    let len = arr.length;
    let idx = ((rawIdx % len) + len) % len;
    offsets[active] = -idx * size;
    active = null;
  }
}


function keyPressed() {
  if (key==='F'||key==='f') fullscreen(!fullscreen());
  if (keyCode===ENTER) {
    let hIdx = round(-offsets.h/size),
        mIdx = round(-offsets.m/size),
        sIdx = round(-offsets.s/size);
    sessionStorage.setItem('selH', hours[hIdx]);
    sessionStorage.setItem('selM', minutes[mIdx]);
    sessionStorage.setItem('selS', seconds[sIdx]);
    setTimeout(()=>location.replace('timer.html'),50);
  }
  if (key===' ' && !spinning) {
    spinning = true;
    spinVel.h = random(150,300);
    spinVel.m = random(150,300);
    spinVel.s = random(150,300);
  }
}

function keyReleased() {
  if (key===' ' && spinning) {
    spinning = false;
    // random pick one time
    for (let k of ['h','m','s']) {
      let arr = (k==='h'?hours:(k==='m'?minutes:seconds));
      let idx = floor(random(arr.length));
      offsets[k] = -idx*size;
    }
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  size = width/7;
  textSize(size);
}
