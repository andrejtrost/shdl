/*File: userint.js (version 3.7) */
/*jshint esversion: 6 */

let boardSim = false; // V34

let english = false; // Log language
let markErr = true;
const SZinName = 12;
const SZinMode = 1;
const SZinType = 5;

const maxPorts = 25;

/* GLOBAL setup: 
    ver: version string, sytnaxC: true for C op syntax,
    nPorts: initial number of ports in HTML table
	maxBinSize: max size of binary bit string for unspecified literals
*/
let setup = {ver: 0, syntaxC: false, nPorts: 3, maxBinSize: 8, vhdl2008: true, stdlogic: true, rst: true, convUnused: false, clkPeriod: 10, vcd: false, defName: "Logic", portDisable:false, rtl:true};

// VHDL keywords or reserved identifiers
const VHDLrsv=["abs","configuration","impure","null","rem","type","access","constant","in","of","report","unaffected","after","disconnect","inertial","on","return","units","alias","downto","inout","open","rol","until","all","else","is","or","ror","use","and","elsif","label","others","select","variable","architecture","end","library","out","severity","wait","array","entity","linkage","package","signal","when","assert","exit","literal","port","shared","while","attribute","file","loop","postponed","sla","with","begin","for","map","procedure","sll","xnor","block","function","mod","process","sra","xor","body","generate","nand","pure","srl","buffer","generic","new","range","subtype","bus","group","next","record","then","case","guarded","nor","register","to","component","if","not","reject","transport","std_logic","signed","unsigned","rising_edge","resize","to_signed","to_unsigned",
"rtl"]; 


function CloseGraph() {
 document.getElementById("overlay").classList.remove("show");   
}

function HDLinit() {
 getSetup();
	
	//Check File API support (from wave.js)
 if (window.File && window.FileList && window.FileReader) {
	var filesInput = document.getElementById("infile");

	filesInput.addEventListener("change", function(event) {
		var files = event.target.files; //FileList object
		var output = document.getElementById("result");

		var file = files[0];

		var picReader = new FileReader();

		picReader.addEventListener("load", function(event) {
			var textFile = event.target;			
		
			load(textFile.result, file.name);
		});		
		picReader.readAsText(file); //Read the text file
	});
 } else {
	setLog("Your browser does not support File API");
 }
 
 if (getUrlParameter('o') !== null) {
	 loadFile(getUrlParameter('o'));
     console.log(getUrlParameter('o'));
 }
}

function getUrlParameter(name) {
    name = name.replace(/[\[]/, '\\[').replace(/[\]]/, '\\]');
    var regex = new RegExp('[\\?&]' + name + '=([^&#]*)');
    var results = regex.exec(location.search);
    return results === null ? null : decodeURIComponent(results[1].replace(/\+/g, ' '));
}

// AT V3.5 new, test....
function loadFile(name) {
  var path = "code/"+name+".shdl";
  fetch(path).then(function(response) {
	  if (!response.ok) {
		  setLog("No file: "+path);
	  } else {
        response.text().then(function(text) {
          load(text, name);
        });
	  }
});
}

function getSetup() { // read document form settings, display version
    //setInterval(checkInputCode, 2000);  
	const v = (parseVersion===undefined) ? -1 : parseVersion;
 
	document.getElementById('version').innerHTML = v;
	const synt = document.getElementById("syntaxc").checked;
	setup.syntaxC = synt;

	setup.vhdl2008 = document.getElementById("lang2008").checked;
	setup.stdlogic = document.getElementById("stdlogic").checked;
	setup.rst = document.getElementById("rst").checked;
	setup.rtl = document.getElementById("rtl").checked;
	english = document.getElementById("english").checked;
	markErr = document.getElementById("mark").checked;
	setup.defName = document.getElementById("comp_name").value;
    setup.clkPeriod = document.getElementById("clk_per").value;
	setup.vcd = document.getElementById("vcd").checked;
	
	if (!(/^[a-zA-Z]\w+$/.test(setup.defName)) || (VHDLrsv.indexOf(setup.defName)>=0)) {
		console.log("Error in Setup Circuit name: '"+setup.defName+"' !");
		setup.defName = "Logic";
		console.log("Revert to default name: "+setup.defName);
		document.getElementById("comp_name").value = setup.defName;
	}
    
    if (document.getElementById("boardOn").checked) {document.getElementById("board").style.display = "inline";}
    else {document.getElementById("board").style.display = "none";}
}

function parseTypeID(s) // V3.5 parse (array) typeID
{
	const typepatt = /^(s|u)([0-9]*)$/;
	
	// check if type is array
	let i = 0;	
	let ch = s.charAt(0);
	let anum = "";
	let array = false;
	let asize = 0;
	
	while (ch >= "0" && ch <= "9") {
		anum += ch;
		i += 1;
		ch = s.charAt(i);		
	}
	if (anum !== "") {	
		s = s.slice(anum.length);
		asize = Number(anum);
		if (asize<=0 || asize>1023) {
			asize=1;
			modelErr("Unsupported size of array declaration (1-1024)!");
		}
		array = true;
	}
	
	if (!typepatt.test(s)) {
		throw modelErr("type", id);
	}
	let u = (s.slice(0,1)==="u"); 
	let size = parseInt(s.slice(1));
	
	return {unsigned: u, size:size, qual:(array) ? "array" : "", asize:asize};
}

function parsePorts(id, m, s, decl) {
	var typepatt = /^(s|u)([0-9]*)$/;
	var namepatt = /^\w+$/;
	
	const sId=id.toLowerCase();
	if (!namepatt.test(id)) {throw modelErr("nam", id);} 
	if (VHDLrsv.indexOf(sId)>=0) { throw modelErr("rsv",id); } 		
	
    if (m==="sig") {m = "";}
	if (!(m==="in" || m==="out" || m==="")) {
		throw modelErr("mode", id);
		//m ="";
	}			
	
	// check if type is array
	let i = 0;	
	let ch = s.charAt(0);
	let anum = "";
	let array = false;
	let asize = 0;
	
	while (ch >= "0" && ch <= "9") {
		anum += ch;
		i += 1;
		ch = s.charAt(i);		
	}
	if (anum !== "") {	
		s = s.slice(anum.length);
		asize = Number(anum);
		if (asize<=0 || asize>1023) {
			asize=1;
			modelErr("Unsupported size of array declaration (1-1024)!"); // TODO: unreachable?
			//console.log("Error: Declared array size out of bounds 1...1023");
		}
		array = true;
	}
	
	if (!typepatt.test(s)) {
		throw modelErr("type", id);
	}
	let u = (s.slice(0,1)==="u"); 
	let size = parseInt(s.slice(1));
	
	if ((u && !(size>=0 && size<65)) || (!u && !(size>1 && size<65))) { //V33 allow u0 (set from var)
		if (u && size==0) {size = 1;}
        else {throw modelErr("size", id);}		
	}
    const qual=(array) ? "array" : "";
	return {type:{unsigned: u, size:size, qual:qual, asize:asize, declared:decl}, mode:m};
}

function getSignals() { //V3.5 get signals from table and model 
    let id="";
	let signals = new Map(); //[];
    
    if (model) {
        [...Array(setup.nPorts)].forEach(function(_, i) {
            id = document.getElementById("name"+(i+1)).value; // id name or id list
            let idArray = id.split(",");
            
            idArray.forEach(function(name, j) {			
                id=name.trim();
                let typeStr = "u0"; 
                let modeStr = "";
                const v = model.vars.get(id);
                if (v) {
                    typeStr= (type(v).unsigned) ? "u" : "s";
                    typeStr += type(v).size;
                    let typeQual = type(v).qual;                   
                    modeStr=v.get().mode;
                    const obj = parsePorts(id, modeStr, typeStr, 2);
                    if (obj!==undefined) {
                        obj.type.qual = typeQual;
                        signals.set(id, obj);
                    }
//setLog("Signal "+id+" "+typeStr);                
                } else {
                    setLog("Wave: no signal "+id);
                }
                
            });
        });
    }
    return signals;
}

function getPorts(qual) {  // get Ports data from html form, V33 add from model
	let id="";
	let signals = new Map(); //[];
		
	[...Array(setup.nPorts)].forEach(function(_, i) {

		id = document.getElementById("name"+(i+1)).value; // id name or id list
        
		let idArray = id.split(",");
		var modeStr = (document.getElementById("mode"+(i+1)).value).trim();        
		var typeStr = (document.getElementById("type"+(i+1)).value).trim();
        const checkType = (typeStr==="")? true : false;
        let typeQual = "";

		idArray.forEach(function(name, j) {			
			id=name.trim();
			if (id !== "") {
                if (checkType) { //V35 typeStr empty, get type from setup
                    typeStr=getDefaultTypeStr(); 
                }
             
				let declared = (j === idArray.length-1) ? 1 : 2;			
				const obj = parsePorts(id, modeStr, typeStr, declared);
                if (qual) {
                    obj.type.qual = typeQual;
                }
				if (obj!==undefined) {signals.set(id, obj);}
			}
		});
	});
	
	return signals;
}

function copyVHDL() {
	let el = document.getElementById("vhdllog");
    let range = document.createRange();
	range.selectNodeContents(el);
	let sel = window.getSelection();
	sel.removeAllRanges();
	sel.addRange(range);
	document.execCommand("copy");	
}

function setVHDL(str) {
    document.getElementById("vhdllog").innerHTML = str;
}

function toggleSection(id) {
    var x = document.getElementById(id);
    if (x.className.indexOf("w3-show") == -1) {
        x.className += " w3-show";
    } else { 
        x.className = x.className.replace(" w3-show", "");
    }
}

// hide('vhdlout'); hide('analysis'); show('porttable', 0);
//hide('vhdlout'); hide('porttable'); show('analysis')">
//hide('porttable'); hide('analysis'); show('vhdlout', 1); VHDLout();">
//hide('porttable'); hide('analysis'); show('vhdlout', 2); TBout();"

function switchDiv(id) { // switch html div display
  boardSim = false;
  switch (id) {
      case "analysis":
        document.getElementById("anal").className = "w3-button w3-blue";         
        document.getElementById("porttable").style.display = "none";
        document.getElementById("ports").className = "w3-button w3-light-gray";   
        document.getElementById("vhdlout").style.display = "none";
        document.getElementById("vhdl").className = "w3-button w3-light-gray";
        document.getElementById("boardsim").style.display = "none";
        document.getElementById("board").className = "w3-button w3-light-gray";
        document.getElementById(id).style.display = "block";        
        break;
      case "vhdlout":       
        document.getElementById("porttable").style.display = "none";
        document.getElementById("ports").className = "w3-button w3-light-gray";
        document.getElementById("analysis").style.display = "none";
        document.getElementById("anal").className = "w3-button w3-light-gray";
        document.getElementById("boardsim").style.display = "none";
        document.getElementById("board").className = "w3-button w3-light-gray";
        document.getElementById(id).style.display = "block";
        document.getElementById("vhdl").className = "w3-button w3-blue";
        break;
      case "boardsim": 
        boardSim = true;
        document.getElementById("porttable").style.display = "none";
        document.getElementById("ports").className = "w3-button w3-light-gray";
        document.getElementById("analysis").style.display = "none";
        document.getElementById("anal").className = "w3-button w3-light-gray";
        document.getElementById("vhdlout").style.display = "none";
        document.getElementById("vhdl").className = "w3-button w3-light-gray";
        document.getElementById(id).style.display = "block"; 
        document.getElementById("board").className = "w3-button w3-blue";
        break;
      default:
        document.getElementById("ports").className = "w3-button w3-blue";        
        document.getElementById("analysis").style.display = "none";
        document.getElementById("anal").className = "w3-button w3-light-gray";
        document.getElementById("vhdlout").style.display = "none";
        document.getElementById("vhdl").className = "w3-button w3-light-gray";
        document.getElementById("boardsim").style.display = "none";
        document.getElementById("board").className = "w3-button w3-light-gray";
        document.getElementById(id).style.display = "block"; break;
  }  
}

function show(id, vhdl) {
    document.getElementById(id).style.display = "block";
	if (vhdl===1) {document.getElementById("output").innerHTML = "Output VHDL-2008";}
	if (vhdl===2) {document.getElementById("output").innerHTML = "VHDL TestBench";}
}
function hide(id) {
  document.getElementById(id).style.display = "none";
}

function src2string()
{
 let data=editor.getValue();
 
 parseCode(); // try to parse model
 let p ="";
 if (model) {
	let ptable = getPorts();
	 
	if (ptable.size > 0) {
		p += "[\n";	 
		ptable.forEach(function (val, id) {
			if (val.type.declared===1) { // single declaration
                var t=typeToString(val.type);
                t = (t=="u0") ? "" : t;
				p += id+": "+val.mode+" "+t+"\n";
			} else {
				p += id+", ";
			}
		});
		p += "]\n";
	}
 } else {
	 setLog("Warning: Save: model undefined!");
 }
 data = p+data;
 return data;
}

function save()
{
 let data = src2string();
 
 if (setup.vcd) data += "\n"+dump2string(); // V3.7 save waveform dump
 
 let file_name = setup.defName;
 if (model) {file_name = model.name();} // set name to model name
  
 file_name += ".shdl"; 
 
 let a = document.createElement("a"),
     file = new Blob([data], {type: "text/plain;charset=utf-8"});
 
 //const file_name = document.getElementById("comp_name").value;
	
 if (window.navigator.msSaveOrOpenBlob) // IE10+
	window.navigator.msSaveOrOpenBlob(file, filename);
 else { // Others
	let url = URL.createObjectURL(file);
	a.href = url;
	a.download = file_name;
	document.body.appendChild(a);
	a.click();
	setTimeout(function() {
		document.body.removeChild(a);
		window.URL.revokeObjectURL(url);  
	}, 0); 
   
 }
 unmarkSave();
 editor.on("inputRead", markSave); 
}

function load(str, name) {
	let newp = true;	
	let j = 0;

	
	//prvi podniz = "[\n"
	let lin = 0;
	let sub = "";
	
	let portsStr = str.substring(str.indexOf("[") + 1, str.indexOf("]")).trim();	
	str = str.substring(str.indexOf("]")+1).trim();
	
	let setStr = " ";
	// search for last two chars "*/"
	if (str.substr(str.length-2)==="*/") {
		let setIdx = str.lastIndexOf("/* W#");	
		if (setIdx>0) {
		  setStr = str.slice(setIdx+4, str.length-2);
		  str = str.substring(0, setIdx);		  
console.log("***"+setStr+"***");		  
		}
	}
	
	/*let setIdx = str.indexOf("[");	
	let setStr = " ";
	if (setIdx > 8) {		
		setStr = str.slice(setIdx + 1, str.indexOf("]"));
		str = str.substring(0, setIdx);
	}*/
		
    const table = document.getElementById("sigtable").getElementsByTagName('tbody')[0];
    table.innerHTML = "";
	setup.nPorts = 0;
	
	if (portsStr!=="") { //(sub.charAt(0)==="[") {
		sub = portsStr;
		let i = 1;
		do {
			
			lin = portsStr.indexOf("\n"); // poišči prvi \n in skrajšaj portsStr
			if (lin !== -1) {
				sub = portsStr.substring(0,lin+1).trim();
				portsStr = portsStr.substring(lin+1);
			}
			else {sub = portsStr; portsStr = "";}
			
			j = sub.indexOf(":");
			if (j !== -1) {
				let names = sub.substring(0,j);
				let tmp = sub.substring(j+1).trim();
				let modeStr = "";
				if (tmp.startsWith("in")) {
					modeStr = "in";
					tmp = tmp.substring(2);
				} else if (tmp.startsWith("out")) {
					modeStr = "out";
					tmp = tmp.substring(3);
				}
				
				let row = table.insertRow(setup.nPorts);
				setup.nPorts += 1;
				
				const nn = tmp.trim();
				const spaceIndex = nn.indexOf(' ');
				const typeStr= spaceIndex === -1 ? nn : nn.substr(0, spaceIndex);
		
				let c = row.insertCell(0);
				c.innerHTML = htmInput(setup.nPorts, "name", SZinName, names);
				c = row.insertCell(1);
				c.innerHTML = htmInput(setup.nPorts, "mode", SZinMode, modeStr);
				c = row.insertCell(2);
				c.innerHTML = htmInput(setup.nPorts, "type", SZinType, typeStr);
				c = row.insertCell(3);
				c.innerHTML = "<td><a onclick='delPort("+setup.nPorts+")' class='w3-text-blue' >x</a></td>";
			}
		} while (portsStr!=="");	
	}
	
	editor.setValue(str);
	unmarkSave();	

    let name2 = "";
	if (name) {
		name2 = name.lastIndexOf('.')==-1 ? name : name.substring(0, name.lastIndexOf('.'));
	}
		
	document.getElementById("comp_name").value = name2;
	
// 3.2.21
    model = undefined;
    setup.portDisable = false;	
    changeSource();
	
	//graf_refresh();
	
	let time = 0;
	
	//const str1 = "#2\nA1 B0 C1 #3\nA0 B1 #1\nC0 A1 #3".split("\n");
	const str1 = setStr.split("\n");
	
	str1.forEach(function (s, i) {
//console.log("<<< "+s);
	  if (i===0) {
		  if (s[0]==="#") {
			  const val = parseInt(s.substring(1));
			  if (val>0 && val<1000) {
				  document.getElementById("cycles").value=val;
				  graf_refresh();
			  }
		  }
	  } else {
		  let dump = s.split(" ");
		  const duration = dump[dump.length-1];
		  if (duration[0]==="#") {
			const cycles = parseInt(duration.substring(1));
	//console.log("<<"+cycles);
			dump.pop();
			setSignalDump(time, time+cycles, dump);
			time += cycles;
		 }
	  }
	});
	
	//let dump = "A1 B0 C1 #3".split(" ");
	
	
			
	
console.log("*Load refresh");	
	graf_refresh();
}

function parseCode() // get setup and source, run Lexer and Parse
{
  getSetup();
  const ta = editor.getValue(); 
  const k = new Lexer(ta); //Lexer("test: begin\n"+ta.value+"end");
   
  Parse(k);
}

function parseButton(n) {
	if (n===0) {
		document.getElementById("parse").className="w3-button w3-teal";
	} else {
		document.getElementById("parse").className="w3-button w3-green";
	}
}

//  set model.changed
//  if true, updatePortTable and refresh graph

function changeSource()
{
	if (model) {
		if (model.changed()===false) {
			model.changed(true);
			if (log) {console.log("Model changed");}
			parseButton(0);
		}
	} else {
        parseButton(0);
    }
	//if (p) 
	updatePortTable();
}

function clearLog() {
  document.getElementById("errlog").innerHTML = "";
  document.getElementById("stat").innerHTML = "";
}

function setLog(str) {
  document.getElementById("errlog").innerHTML += str+"\n";
}

function errTxt(str, id) {  // compose error log text, use global english
	let s = "";
	
	switch (str) {
		// parse errors (12)
        case "ads1": s = (english) ? "One bit add/subtract not supported!" : "Enobitno se(od)števanje ni podprto!"; break;
		case "exp": s = (english) ? "Expecting '"+id+"'!" : "Pričakujem '"+id+"'!"; break;
        case "expvi": s = (english) ? "Expected signal index!" : "Pričakujem signal (indeks)!"; break;
		case "expvn": s = (english) ? "Expected signal or number!" : "Pričakujem signal ali število!"; break;
		case "explit": s = (english) ? "Expected numeric literal!" : "Pričakujem številsko vrednost!"; break;
		case "sizeov": s = (english) ? "Operation size overflow (1-64)!" : "Napačna velikost operacije (1-64)!"; break;
		case "tin": s = (english) ? "Assignment to input signal '"+id+"'!" : "Prireditev vhodnemu signalu '"+id+"'!"; break;
        case "tcon": s = (english) ? "Assignment to constant '"+id+"'!" : "Prireditev konstanti '"+id+"'!"; break;
		case "unexp": s = (english) ? "Unexpected token '"+id+"'!" : "Nepričakovan simbol '"+id+"'!"; break;
		case "mixs": s = (english) ? "Illegal usage of Signed and Unsigned in expression!" : 
		                             "Neveljavna uporaba Signed in Unsigned v izrazu!"; break;
		case "slice": s = (english) ? "Slice range error!" : "Napaka v območju podvektorja!"; break;
		case "limit": s = (english) ? "Concatenation size > 64 bits!" : "Sestavljen signal > 64 bitov!"; break;
		case "unsh": s = (english) ? "Shift unsupported in this expression!" : "Pomik ni podprt v tem izrazu!"; break;
		case "cuse": s = (english) ? "Operator not supported in VHDL syntax!" : "Operator ni podprt v sintaksi VHDL!"; break;
		case "vuse": s = (english) ? "Operator not supported in C syntax!" : "Operator ni podprt v sintaksi C!"; break;
		// simulator errors
		case "inf": s = (english) ? "Simulation infinite loop!" : "Simulacija v neskončni zanki!"; break;
		// input errors (9)
		case "rsv": s = (english) ? "Illegal use of reserved word '"+id+"'!" : "Napačna raba rezervirane besede '"+id+"'!"; break;
		case "nam": s = (english) ? "Illegal signal name '"+id+"'!" : "Neveljavno ime signala '"+id+"'!"; break;
		case "cnam": s = (english) ? "Illegal circuit name '"+id+"'!" : "Neveljavno ime vezja '"+id+"'!"; break;
		case "cnam2": s = (english) ? "Circuit name used as signal name '"+id+"'!" : "Ime vezja je uporabljeno za ime signala '"+id+"'!"; break;
		case "mixc": s = (english) ? "Illegal use of mixed case in signal name '"+id+"'!" : "Napačna raba velikih in malih črk v imenu signala '"+id+"'!"; break;
		case "mode": s = (english) ? "Unknown Mode for port '"+id+"'!" : "Neznan Mode priključka '"+id+"'!"; break;
		case "type": s = (english) ? "Illegal Type of signal '"+id+"'!" : "Napačna oznaka tipa signala '"+id+"'!"; break;
		case "size": s = (english) ? "Illegal size of signal '"+id+"' (1-64)!" : "Napačna velikost signala '"+id+"' (1-64)!"; break;
		case "decl": s = (english) ? "Signal '"+id+"' is already declared!" : "Signal '"+id+"' je ponovno deklariran!"; break;
		// visit model errors (6)
		case "vin": s = (english) ? "Signal '"+id+"' should be input!" : "Signal '"+id+"' mora biti vhod!"; break;
		case "cmpsz": s = (english) ? "Compare size mismatch!" : "Neujemanje velikosti primerjave!"; break; 
		case "cmpm": s = (english) ?  "Illegal Signed/Unsigned comparisson!" : "Neveljavna primerjava različno predznačenih vrednosti!"; break;
		case "cmpb": s = (english) ?  "Illegal one-bit comparisson!" : "Neveljavna enobitna primerjava!"; break;
		case "mix": s = (english) ?  "Mixed comb and sequential assignments!" : 
		                             "Mešanje kombinacijsih in sekvenčnih prireditev!"; break;
		case "mult": s = (english) ?  "Multiple assignments to '"+id+"' in same block!" :
									  "Večkratna prireditev signalu '"+id+"' v istem bloku!"; break;
		case "rel": s = (english) ?  "Relation operator is not allowed in assignment statement!" :
									  "Relacijski operator ni dovoljen v prireditvenem stavku!"; break;
		case "str": s = (english) ?  "Illegal bit string format!" :
									 "Neveljaven zapis niza bitov!"; break;
									  
		default: s = str;
	}
	return s;
}

function modelErr(s, id, pos) { // error in model
	const er = (english) ? "Error " : "Napaka ";
	let str = "<span style='color: red;'>"+er+"</span>";
	const er1 = (english) ? "at " : "v ";	
	if (pos!==undefined) {
		str += er1+pos+": ";
		const line = Number(pos.substr(0, pos.indexOf(':')));
		selectLine(line);
	}
	else {str += ": ";}
	str += errTxt(s, id);
	return str;
}


function modelWarn(s, pos) {  //0104
	let str = "<span style='color: blue;'>Warning </span>";
	
	if (pos!==undefined) {
		str += "at "+pos+": ";
	}
	str += s;
	return str;
}

function setStat(str) {
  document.getElementById("stat").innerHTML += str+"\n";
}

function getDefaultType() {  // oldgetType -> getDefaultType
	let unsigned= document.getElementById("type").value==="u" ? true : false;
	let size = parseInt(document.getElementById("width").value);
	if ((unsigned && !(size>0 && size<65)) || (!unsigned && !(size>1 && size<65))) {
		throw modelErr("size", "Default data type");
		//size = 1;
	}	
	if (size===1) {return {id:"bit", unsigned:true, size:1};}
	else {return {id:"sig", unsigned:unsigned, size:size, def:true};}
}

function getDefaultTypeStr() {  // V3.5
	const unsigned= document.getElementById("type").value==="u" ? true : false;
	const size = parseInt(document.getElementById("width").value);
	if ((unsigned && !(size>0 && size<65)) || (!unsigned && !(size>1 && size<65))) {
		throw modelErr("size", "Default data type");
		//size = 1;
	}	
    
    const u = unsigned ? "u" : "s";
    return u+size;
}

function htmInput(i, id, size, value) {
    return "<td><input id='"+id+i+"' size='"+size+"' value='"+value+"' type='text' onchange='changeSource();'></td>";
}

function disablePort(b) { // V3.5
  setup.portDisable=b;
  [...Array(setup.nPorts)].forEach(function(_, i) {
	  document.getElementById("mode"+(i+1)).disabled=b;
      //document.getElementById("mode"+(i+1)).style.visibility="hidden";
	  document.getElementById("type"+(i+1)).disabled=b;
	});	  
}

//5.2.2021
function updatePortTable() {
 let str = "";
 let a = [];
 
 // do not update, if model not compiled or has no entity
 if (!model || model.entity===false) return;

 [...Array(setup.nPorts)].forEach(function(_, i) {
	let id = document.getElementById("name"+(i+1)).value; // id name or id list	
	a = a.concat(id.split(","));
 });
 
 let idA = Array.from(new Set(a)); // remove duplicate names, array->set->array
 
 setup.nPorts = 0;

 const table = document.getElementById("sigtable").getElementsByTagName('tbody')[0];
 table.innerHTML = "";

 idA.forEach(function(name, j) {	
   let id = name.trim();
   str += id;
   

   let row = table.insertRow(setup.nPorts);
   setup.nPorts += 1;

   let c = row.insertCell(0);
   c.innerHTML = htmInput(setup.nPorts, "name", SZinName, id);

   
	   const v = model.vars.get(id);
	   let typeStr = "";
	   let modeStr = "";
	   if (v) {
			typeStr= (type(v).unsigned) ? "u" : "s";
            typeStr += type(v).size;
            typeQual = type(v).qual;                   
            modeStr=v.get().mode;
			
			str += ": "+modeStr+" "+typeStr;
	   }
 
   c = row.insertCell(1);
   c.innerHTML = htmInput(setup.nPorts, "mode", SZinMode, modeStr);
   c = row.insertCell(2);
   c.innerHTML = htmInput(setup.nPorts, "type", SZinType, typeStr);
   c = row.insertCell(3);
   c.innerHTML = "<td><a onclick='delPort("+setup.nPorts+")' class='w3-text-blue' >x</a></td>";
 
   str+=";\n";
   
   
 });

  if (model.entity) disablePort(true);
  graf_refresh();  
}	
	
function addPort() { // V3.5
  if (setup.nPorts >= maxPorts) return;

  const table = document.getElementById("sigtable").getElementsByTagName('tbody')[0];    
  const row = table.insertRow(setup.nPorts);
  setup.nPorts+=1;
  
  let c = row.insertCell(0);
  c.innerHTML = htmInput(setup.nPorts, "name", SZinName, "");
  c = row.insertCell(1);
  c.innerHTML = htmInput(setup.nPorts, "mode", SZinMode, "");
  c = row.insertCell(2);
  c.innerHTML = htmInput(setup.nPorts, "type", SZinType, "", true);  
  c = row.insertCell(3);
  c.innerHTML = "<td><a onclick='delPort("+setup.nPorts+")' class='w3-text-blue' >x</a></td>";
  
  disablePort(setup.portDisable);
  changeSource();  
}

function removePort() {
  const table = document.getElementById("sigtable").getElementsByTagName('tbody')[0];
  if (setup.nPorts>1) {
    const row = table.deleteRow(setup.nPorts-1);
    setup.nPorts-=1;
  } else {
    let r = table.rows[0];
    r.cells[0].innerHTML = htmInput(setup.nPorts, "name", SZinName, "");
    r.cells[1].innerHTML = htmInput(setup.nPorts, "mode", SZinMode, "");
    r.cells[2].innerHTML = htmInput(setup.nPorts, "type", SZinType, ""); 
  }
  graf_refresh();
}

function delPort(n) {
    const table = document.getElementById("sigtable").getElementsByTagName('tbody')[0];
    
	if (setup.nPorts>1) {
		table.deleteRow(n-1);
		setup.nPorts -= 1;
		
		// renumerate index
		let str="";
		for(var i = 0; i < table.rows.length; i++)
		{
			let c = table.rows[i].cells[0];
			//let n = c.children[0].value;
			c.innerHTML = htmInput(i+1, "name", SZinName, c.children[0].value);
						
			c = table.rows[i].cells[1];
			c.innerHTML = htmInput(i+1, "mode", SZinMode, c.children[0].value);
			
			//let m = c.children[0].value;
			c = table.rows[i].cells[2];
			
			c.innerHTML = htmInput(i+1, "type", SZinType, c.children[0].value);
			//let t = c.children[0].value;
			
			//alert(n+"."+m+"."+t);
			
			c = table.rows[i].cells[3];			
			c.innerHTML = "<td><a onclick='delPort("+(i+1)+")' class='w3-text-blue' >x</a></td>";
        }
		
		graf_refresh();
	} else {
		let r = table.rows[0];
		r.cells[0].innerHTML = htmInput(setup.nPorts, "name", SZinName, "");
		r.cells[1].innerHTML = htmInput(setup.nPorts, "mode", SZinMode, "");
		r.cells[2].innerHTML = htmInput(setup.nPorts, "type", SZinType, ""); 	
	}
}

function selectLine(lineNum) { // select a line in CodeMirror
	const len = editor.getLine(lineNum-1).length;
	editor.setSelection({line: lineNum-1, ch:0}, {line: lineNum-1, ch:len});
}

function newEntity()
{
    getSetup();
	disablePort(false);
	
	const r = confirm("New HDL description ?"); 

	if (r == true) {
		clearLog();
		
		let str = "entity "+setup.defName+"\n";

		try {
			getPorts();
			
			[...Array(setup.nPorts)].forEach(function(_, i) {
				let id = document.getElementById("name"+(i+1)).value; // id name or id list
				const modeStr = document.getElementById("mode"+(i+1)).value;
				let typeStr = (document.getElementById("type"+(i+1)).value);
				
        if (typeStr==="") typeStr="u1"; //V33 TODO check
				
				if (id!=="") {str += " "+id+": "+modeStr+" "+typeStr+";\n";}
			}); 
		} catch (er) {
			setLog(er);			
		}		
		
		str += "begin\n\nend\n";
		editor.setValue(str);
	}
}

function getCanvas(id) {
    return document.getElementById(id);
}

function refresh(clean) { //V34 refresh graph and board
    if (boardSim) {refreshBoard(clean);}
    graf_refresh();
}