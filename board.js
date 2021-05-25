

let boardDes = (function() {    // Board description
	let outNames = ["led", "bcd"];
    let outValues = [0, 0];
    let inNames = ["btn", "rot"];
    let inValues = [0, 0];

    let rot = [0, 0, 1, 1, 1, 3, 3, 2, 2, 2, 0, 0];
    let roti = 0;
    let rotinc = 1;
    let rotpos = 0;
    
    let step = 0;
    let curCycle = 0;
    let maxCycle = 0;

	return {outNames, outValues, inNames, inValues, step, rot, roti, rotinc, rotpos};
}());

let running = 0;


function startstop(one)
{    
 if (running==0) {
   running=1; 
   if (!(boardDes.curCycle>=0 && boardDes.curCycle<getCycles())) {boardDes.curCycle = 0;}
   
   boardDes.maxCycle = wave.cycles();
   action(); document.getElementById("brdrun").value="Stop";
   document.getElementById("brdrun").className = "w3-button w3-red";   
 }
 else {
  running=0;
  document.getElementById("brdrun").value="Start";
  document.getElementById("brdrun").className = "w3-button w3-green";
 }
}

let action = function() {
    if (boardSim!==true) {
        running=0; return;
    }
    var focusedElement = document.activeElement;
    if (boardDes.curCycle>0) {
        boardDes.step += 1;
        document.getElementById("brdstep").textContent=boardDes.step;
    }
    const res = runCycle(model, boardDes.curCycle);
    if (!res &&  boardDes.curCycle<boardDes.maxCycle) {running=0; return;} // run, exit if false
    
    boardDes.curCycle = (boardDes.curCycle>=boardDes.maxCycle) ? 0 : boardDes.curCycle+1;
    refresh();
   
	focusedElement.focus();
	
    if (running==1) {
        let timeout = 10;
        const tmp = document.getElementById('speed').value;
        if (tmp==="0") timeout=500;
        else if (tmp==="1") timeout=100;
        
        if (boardDes.roti>0 && boardDes.roti<11) {
            boardDes.inValues[1] = boardDes.rot[boardDes.roti];
            boardDes.roti += boardDes.rotinc;
        }
        
        setTimeout(action, timeout);
    }
};

function boardRot(n) {
   if (n===1) {
       boardDes.roti = 1;
       boardDes.rotinc = 1;
       boardDes.rotpos = (boardDes.rotpos<3) ? boardDes.rotpos+1 : 0;
   } else {
       boardDes.roti = 10;
       boardDes.rotinc = -1;
       boardDes.rotpos = (boardDes.rotpos>0) ? boardDes.rotpos-1 : 3;
   }
}

function boardBtn(n) {
    let i = boardDes.inNames.indexOf("btn");
    const st = 1 << n;
        
    if ((boardDes.inValues[i] & st)===0) {
         document.getElementById("btn"+n).className = "w3-circle w3-tiny w3-blue";         
    } else {
        document.getElementById("btn"+n).className = "w3-circle w3-tiny w3-lightgray";
    }
    boardDes.inValues[i]^=st;
}

function boardClear() {
  let canvas = getCanvas("brd");
  let context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);  
}

function drawSegment(c, x0, y0, id) {
  const width = 30;
  const height = 50;
  const borderWidth = 4;
  
  c.beginPath();
  c.rect(x0-4, y0-4, width+8, height+8);
  c.stroke();
  c.fillStyle = 'red';

  switch(id) {
    case 0:
      c.fillRect(x0+5,y0,width-10,borderWidth);      
      break;
    case 1:
      c.fillRect(x0+width-borderWidth, y0+5, borderWidth, height/2-10);
      break;
    case 2:
      c.fillRect(x0+width-borderWidth, y0+height/2+5, borderWidth, height/2-10);
      break;
    case 3:
      c.fillRect(x0+5, y0+height-borderWidth, width-10, borderWidth);
      break;
    case 4:
      c.fillRect(x0, y0+height/2+5, borderWidth, height/2-10);        
      break;      
    case 5:
      c.fillRect(x0,y0+5,borderWidth,height/2-10);
      break      
    case 6:
      c.fillRect(x0+5, y0+height/2-2, width-10, borderWidth);        
      break;
  }    
}

function drawBCD() {
 let canvas = getCanvas("brd");
   
 if (canvas.getContext) {
   c = canvas.getContext("2d");
 } else {
   throw new Error("Can not get brd Canvas Context");
 }
  
 const segment = [
  [0, 1, 2, 3, 4, 5],     // 0
  [1, 2],                 // 1
  [0, 1, 3, 4, 6],        // 2
  [0, 1, 2, 3, 6],        // 3
  [1, 2, 5, 6],           // 4
  [0, 2, 3, 5, 6],        // 5
  [0, 2, 3, 4, 5, 6],     // 6
  [0, 1, 2],              // 7
  [0, 1, 2, 3, 4, 5, 6],  // 8
  [0, 1, 2, 3, 5, 6],     // 9
  [0, 1, 2, 4, 5, 6],
  [2, 3, 4, 5, 6],
  [0, 3, 4, 5],
  [1, 2, 3, 4, 6],
  [0, 3, 4, 5, 6],
  [0, 4, 5, 6]            // F
 ]; 
 const b = boardDes.outValues[1];
  
 segment[b & 0xf].forEach(id => drawSegment(c, 150, 10, id)); 
 segment[(b & 0xf0) >>> 4].forEach(id => drawSegment(c, 100, 10, id));
}

function drawLed() {
 let canvas = getCanvas("brd");
 const b = boardDes.outValues[0];
 
 if (canvas.getContext) {
   c = canvas.getContext("2d");
 } else {
   throw new Error("Can not get MyCanvas Context");
 }  

 c.strokeStyle = "black";
 let i;
 for (i=7; i>=0; i--) {
    c.beginPath();
    c.arc(180-20*i, 100, 8, 0, 2*Math.PI, false);
    c.lineWidth = 2;
    if ((b & (1 << i))!==0) {c.fillStyle = 'greenyellow';} // 
    else {c.fillStyle = 'gray';}
 
    c.fill();
    c.stroke();
 }
}

function drawRot() {
  let canvas = getCanvas("brd");
  const cx=50;
  const cy=35;
    
  c.beginPath();
  c.arc(cx, cy, 20, 0, 2*Math.PI, false);
  c.lineWidth = 2;
  c.fillStyle = 'brown'; 
  c.fill();
  c.stroke();
  
  c.strokeStyle="yellow";
  c.beginPath();
  switch(boardDes.rotpos) {
      case 1:
        c.moveTo(cx+20, cy);
        c.lineTo(cx+20-15,cy-3);
        c.lineTo(cx+20-15, cy+3);
        c.lineTo(cx+20, cy);      
        break;
      case 2:
        c.moveTo(cx, cy+20);
        c.lineTo(cx+3,cy+20-15);
        c.lineTo(cx-3, cy+20-15);
        c.lineTo(cx, cy+20);        
        break;
      case 3:
        c.moveTo(cx-20, cy);
        c.lineTo(cx-20+15,cy-3);
        c.lineTo(cx-20+15, cy+3);
        c.lineTo(cx-20, cy);     
        break;        
       default:
        c.moveTo(cx, cy-20);
        c.lineTo(cx+3,cy-20+15);
        c.lineTo(cx-3, cy-20+15);
        c.lineTo(cx, cy-20);
  } 
  c.stroke(); 
}

function refreshBoard(clean) {
    if (clean) { // reset board
      boardDes.step = 0;
      boardDes.curCycle = 0;
      document.getElementById("brdstep").textContent="0";
      boardDes.outValues = [0, 0];      
    }
    boardClear()
    drawLed();
    drawBCD();
    drawRot();
}