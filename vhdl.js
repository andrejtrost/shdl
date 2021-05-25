/*File: vhdl.js */
/*jshint esversion: 6 */
/*global type, setup, model, setLog, modelErr, VHDLrsv, mode, hdl, process, parseCode, vec, getCycles, ports, signals, Bit*/

let std_logic_ports = [];

function makeBold(input) {
 const keywords=["library","use","all","entity","port","in","out","is","begin",
 "end", "architecture","downto","of", "signal","constant","process",
 "if", "then", "else", "elsif", "null", "case", "when", "others",
 "map", "time", "wait", "for", "and", "or", "not", "xor", "type", "array", "sll", "slr"];
 return input.replace(new RegExp('(\\b)(' + keywords.join('|') + ')(\\b)','ig'), '$1<b class="w3-text-indigo">$2</b>$3');
}

function makeColor(input) {
 const keywords=["std_logic","std_logic_vector","signed","unsigned"];
 const functions=["rising_edge", "resize", "to_signed", "to_unsigned", "to_integer", "shift_left", "shift_right"];
 const tmp=input.replace(new RegExp('(\\b)(' + keywords.join('|') + ')(\\b)','ig'), '$1<span class="w3-text-purple">$2</span>$3');

 return tmp.replace(new RegExp('(\\b)(' + functions.join('|') + ')(\\b)','ig'), '$1<span class="w3-text-blue">$2</span>$3');
}

function range(sz) {
  return "(<span class='w3-text-deep-orange'>" + (sz-1) + "</span> " + "downto <span class='w3-text-deep-orange'>0</span>)";
}

//TODO: use userint swith for vector size
function initValue(variable, value)
{
  let str = "";
  const size = type(variable).size;
  const n = Number(value);
  if (type(variable).size === 1) { // single bit constant
	if (n%2 === 1) {str += "'1'";}
	else {str += "'0'";}
  } else {     
	if (type(variable).size <= setup.maxBinSize) {		
		let bin = n.toString(2);
		if (n<0) {			// V3.5
			bin = (2**type(variable).size+n).toString(2);
		}
		
		const numSz = bin.length;
		if (numSz <= size) {
			str +="\""+bin.padStart(size, '0')+"\"";
		} else {
			str += "\""+bin.slice(-size)+"\"";
		}
	} else {
		if (setup.vhdl2008) {
		  if (n<0) { str += "-"+type(variable).size+"D\""+(-n)+"\""; }
		  else { str += type(variable).size+"D\""+n+"\""; }
		} else {
			if (type(variable).unsigned) {
				str += "to_unsigned("+value+","+type(variable).size+")";
			} else {
				str += "to_signed("+value+","+type(variable).size+")";
			}
		}
	}
  }
  return str;
}

// VHDL ports and signals code
function VHDLports() {
  if (model===undefined) {return;}
  var namepatt = /^[a-zA-Z]\w+$/;
  setLog("Generate VHDL.");

  let s = "library <b class='w3-text-brown'>IEEE</b>;\n";
  s += "use <b class='w3-text-brown'>IEEE.std_logic_1164</b>.all;\n";
  s += "use <b class='w3-text-brown'>IEEE.numeric_std</b>.all;\n\n";

  var comp_name = model.name();

  //document.getElementById("comp_name").value;
  const sName=comp_name.toLowerCase();
  if (!namepatt.test(comp_name)) {setLog(modelErr("cnam", comp_name));}
  if (VHDLrsv.indexOf(sName)>=0) {setLog(modelErr("cnam",comp_name));}
  // test if circuit name = signal name
  if (model.getVar(sName, true)!==null) {setLog(modelErr("cnam2",comp_name));}

  s += "entity" + " " + comp_name + " is\n";

  s += " port (\n";
  
  let prev = 1;
  if (model.getSeq()) {    
	if (setup.rst) {  //V3.4b async reset
	  s += "   clk, rst : in std_logic";
	} else {
	  s += "   clk : in std_logic";
	}
	  prev = 0;
  }

  model.ports.forEach(function (val, id) {
	var tip = "std_logic"; // default 1-bit type
	var mod = val.mode;
	if (mod==="in" || mod==="out") {
		if (val.type.size>1) {
			if (setup.stdlogic) { tip = "std_logic_vector"; std_logic_ports.push(id); id = id+"_v";}
			else if (val.type.unsigned) tip = "unsigned";
			else tip = "signed";
		}		

		// add separators to finish previous declaration
		if (prev===0) { s += ";\n   "; }
		else if (prev===1) { s += "   "; }
		else if (prev===2) { s += ", "; }

		if (val.type.declared===1) { // single declaration (1) or continue list
			s += id + " " + ":" + " " + val.mode + " " + tip;
			if (val.type.size>1) {s += range(val.type.size);}
			prev = 0;
		} else {
			s += id;
			prev = 2;
		}
	}
  });
  s += " );\n";

  s += "end "+ comp_name +";\n";
  s += "\narchitecture RTL of" + " " + comp_name + " " + "is" + "\n";

  // V33 start with type enum declaration
  let typeSet = new Set();
  model.vars.forEach(function (val, id) {
    if (type(val).qual[0]==="t") {
        if (!typeSet.has(type(val).qual)) {
         typeSet.add(type(val).qual);
         s += " type "+type(val).qual+" is (";
         const enumQual="c"+type(val).qual;
         prev = 0;
        
         model.vars.forEach(function (val2, id2) {
            if (type(val2).qual===enumQual) {
                if (prev>0) {s += ", ";}
                else { prev=1; }
                s += val2.get().name;
            }
         });    
         s += ");\n";
        }
    }  
  });

  model.vars.forEach(function (val, id) {
	var tip = "unsigned";
	var mod = mode(val);
	var init = val.get().init;

	if (mod==="") {       
		if (type(val).unsigned===false) tip = "signed";
		if (type(val).size===1) {tip = "std_logic";}

		if (type(val).qual==="array") { // parse array data type
			s+=" type "+val.get().name+"_type is array (0 to "+(type(val).asize-1)+") of " + tip +"";
			if (type(val).size>1) {
				s += range(type(val).size);
			}
            s += ";\n";
            if (hdl(val).mode === "const") { s+=" constant "; }
			else { s+=" signal "; }
				
			s+=val.get().name+" : "+val.get().name+"_type";
			if (init.length==0) { s += " := (others => "+initValue(val, 0)+");\n"; }
			else {
				s += " := (";
				let j=0;
				let jfill = init.length;
				let jmax = type(val).asize;
				let next=false;
				if (jmax>8) {
					s += "\n";
					for (j=0; j<jfill; j++) {
						if (next) s+= ",\n";
						else next = true;
						s += "   "+j+"=> "+initValue(val, init[j][0]);
					}				
					if (jfill<jmax) {
						s += ",\n   others => "+initValue(val, 0);
					}
				} else {
					for (j=0; j<jmax; j++) {
						if (next) s+= ", ";
						else next = true;
						if (j<init.length) s += initValue(val, init[j][0]);
						else s += initValue(val, 0);
					}
				}
				s += ");\n";
			}
        } else if (type(val).qual[0]==="t") { // V33 qualified type            
            s += " signal "+ val.get().name + " " + ": " + type(val).qual+";\n";            
        } else if (type(val).qual[0]==="c") { // V33 constant, do nothing
            ;
		} else { // parse constant or signal declaration
			if (hdl(val).mode === "const") {
				s += " constant "+ val.get().name + " " + ": " + tip;
            } else {
				s += " signal "+ val.get().name + " " + ": " + tip;
			}
			if (type(val).size>1) {
			  s += range(type(val).size);
			}
			if (hdl(val).mode === "const") {
				s += " := "+initValue(val, hdl(val).val)+";\n";
			} else if (hdl(val).assignop==="<=") {	// initial register value
                let init1 = val.get().init;
               
                if (init1 === undefined || init1.length === 0) {
                    s += " := "+initValue(val, 0)+";\n";
                } else {
                    s += " := "+initValue(val, init1[0])+";\n"; //V32
                }
			} else {
				s += ";\n";
			}
		}

	}
  });
  
  std_logic_ports.forEach(function(id) {
	const varo = model.getVar(id, true).get();
	const sigstr = (varo.type.unsigned) ? "unsigned" : "signed";
	//s += range(type(val).size);
	s += " signal "+id+" : "+sigstr+range(varo.type.size)+";\n";
  });

  return s;
}

function VHDLcomb(proc) {
	let s ="";
	let b = model.getBlok();
	// write component instantiations
	b.statements.forEach(function(st) {
		if (!st.get().translated && st.get().id==="inst") {
			st.set({translated: true});
			s += st.emitVHD(0, true)+"\n";
		}
	});


	// write comb single assignments in the first level block 
    // V31 and when..else
	b.statements.forEach(function(st) {
//console.log("VHDLcomb: "+hdl(st.get().target).assignments);
//console.log("VHDLcomb2: "+ st.get().target.visit()+"_"+st.get().translated);// st.emitVHD());
		if (!st.get().translated) {
			if (st.get().id==="=" && hdl(st.get().target).assignments===1) {

				st.set({translated: true});
				s += st.emitVHD(0, true);
			} else if (st.get().id==="if" && st.get().ifType===1) { //&& st.get().ifType===1 V31
                st.set({translated: true});
				s += st.emitVHD(0, true);
			} else if (st.get().id==="inst") {
                s += st.emitVHD();
            }
            
		}
	});


	if (proc) { // need comb process
		let s1 = "";
		process.initList();
		//setLog("Init");
		b.statements.forEach(function(st) {
			if (!st.get().translated) {
				if (st.get().id==="=") {
					s1 += st.emitVHD(2, true);
				} else if (st.get().id==="if") {
					s1 += st.emitVHD(2, true);
				}
			}
		});

		if (setup.vhdl2008) { s +="\nprocess(all)\nbegin\n"; }
		else { s+= "\nprocess("+process.sensList()+")\nbegin\n"; }
		s+=s1;
		s+= "end process;\n";
	}


	return s;
}

function VHDLseq() {
	//V3.4b async reset
	let s ="\nprocess(clk";
	if (setup.rst) { s += ", rst";}
	s +=")\nbegin\n";
	if (setup.rst) {
	  s += " if rst='1' then\n";
	  model.vars.forEach(function (val, id) {
		if (hdl(val).assignop==="<=") {	// initial register value
       
                let init1 = val.get().init;
				let id0 = val.get().name;
                
                if (type(val).qual!=="") {  // enum type qual set                
                    const enumQual="c"+type(val).qual;
                    let rstVal="0";
                    let found = false;        
                    model.vars.forEach(function (val2, id2) {
                        if (!found && type(val2).qual===enumQual) {                        
                            rstVal = val2.get().name;
                            found = true;
                        }
                    });                                 
                    s += "  "+id0+ " <= "+rstVal+";\n";
                } else if (init1 === undefined || init1.length === 0) {
                    s += "  "+id0+ " <= "+initValue(val, 0)+";\n";
                } else {
                    s += "  "+id0 + " <= "+initValue(val, init1[0])+";\n"; //V32
                }
		}
	  });	
      s += " elsif rising_edge(clk) then\n";
	} else {
	  s += " if rising_edge(clk) then\n";	
	}

	let b = model.getBlok();
	b.statements.forEach(function(st) {
//console.log("VHDLseq: "+(st.get().id)+st.get().translated);
		if (!st.get().translated) {
			s += st.emitVHD(2, false);
		}
	});

	s += " end if;\nend process;\n";
	return s;
}

// traverse model tree, search and mark comb blocks
function searchComb(b, level) {	 // traverse code block
	let combProc = false;

	b.statements.forEach(function(st) {		
//console.log("TR "+level+" st:"+st.get().id+" "+combProc);
		  if (st.get().id==="if" && st.get().ifType===0) { // V31
			let setIfComb = false;	 // change 0611
			let b1 = st.get().ifBlock;
			let b2 = st.get().elseBlock;
			if (b1.get().combCnt > 0) {combProc = true; setIfComb = true;}
			if (searchComb(b1, level+1)) {combProc = true; setIfComb = true;}
			if (b2!== null) {
				if (b2.get().combCnt > 0) {combProc = true; setIfComb = true;}
				if (searchComb(b2, level+1)) {combProc = true; setIfComb = true;}
			}
			st.set({combProc: setIfComb});	// mark if statement !
//console.log("POP IF "+b1.get().combCnt+combProc);
		  }
	  });
	return combProc;
}

function searchSeq(b) {
	let seqProc = false;

	b.statements.forEach(function(st) {
		  let setIfSeq = false;
		  if (st.get().id==="if") {
			let b1 = st.get().ifBlock;
			let b2 = st.get().elseBlock;
			if (b1.get().seqCnt > 0) {seqProc = true; setIfSeq = true;}
			if (searchSeq(b1)) {seqProc = true; setIfSeq = true;}
			if (b2!== null) {
				if (b2.get().seqCnt > 0) {seqProc = true; setIfSeq = true;}
				if (searchSeq(b2)) {seqProc = true; setIfSeq = true;}
			}

			st.set({seqProc: setIfSeq});  // mark if statement !
		  }
	  });
	return seqProc;
}

function VHDLout() {
	let combProc = false;
	parseCode(); // try to parse model

	if (model) {
	  //if (model.changed()) {parseCode();} // recompile on change

	  // mark comb if statements
	  let b = model.getBlok();
	  combProc = searchComb(b, 0);
console.log("BLOK comb: "+combProc);
	  searchSeq(b);

	  model.visit(2); // visit, second pass
	  console.log("VHDL pass 2");
	  model.vars.forEach(function(v) {
console.log(v.visit(-1)+" val="+vec.out(v.val(), type(v).unsigned)+" mode="+mode(v)+" type="+typeToString(type(v))+
			" "+type(v).id+" hdl="+hdl(v).mode+" "+hdl(v).val);
	  });

	} else {
		return;
	}

	let vver="VHDL";
	if (setup.vhdl2008) {vver="VHDL-2008";}
	document.getElementById("output").innerHTML = vver;

	std_logic_ports = [];
	let s = VHDLports();

	// deklaracije
	s += "begin\n";
	if (setup.stdlogic) {
		std_logic_ports.forEach(function(id) {			
			if (model.getVar(id, true).get().mode==="in") {				
			    const sigstr = (model.getVar(id, true).get().type.unsigned) ? "unsigned" : "signed";
				s += id+" <= "+sigstr+"("+id+"_v);\n";
			} else {
				s += id+"_v <= std_logic_vector("+id+");\n";
			}
		});
	}
	
	
	if (model) {s += VHDLcomb(combProc);}

	if (model.getSeq()) {s += VHDLseq();}

	s += "\nend RTL;";
	document.getElementById("vhdllog").innerHTML = makeColor(makeBold(s));
}

function pad(bits, dolzina) {
	let str = '' + bits;
	while (str.length < dolzina) {
		str = '0' + str;
	}
	return str;
}

function TBout() {
  let s = "";

  if (model) {
	if (model.changed()) {parseCode();} // recompile on change
  } else {
	 document.getElementById("vhdllog").innerHTML = "";
	 return;
  }

  const clk_per = document.getElementById("clk_per").value;

  s += "library <b class='w3-text-brown'>IEEE</b>;\n";
  s += "use <b class='w3-text-brown'>IEEE.std_logic_1164</b>.all;\n";
  s += "use <b class='w3-text-brown'>IEEE.numeric_std</b>.all;\n\n";

  const comp_name = model.name();
  s += "entity" + " " + comp_name + "_tb is\n";
  s += "end "+ comp_name +"_tb;\n";
  s += "\narchitecture sim of" + " " + comp_name + "_tb " + "is" + "\n";

  if (isSequential()) {
	if (setup.rst) {  //V3.4b async reset
	  s += " signal clk, rst : std_logic := '1';\n";
	} else {
	  s += " signal clk : std_logic := '1';\n";
	}
  }

  let first=true;

  model.ports.forEach(function (val, id) {
	var tip = "";
	var mod = val.mode;
	if (mod==="in" || mod==="out") {
        if (val.type.size===1) {tip = "std_logic";}
        else {
            if (setup.stdlogic) { tip = "std_logic_vector"; id = id+"_v";}
            else if (val.type.unsigned) tip = "unsigned";
            else tip = "signed";
        } 

		s += " signal ";
		s += id + " " + ": " + tip;
		if (val.type.size>1) {
		  s += range(val.type.size);
		}
		if (mod==="in") {
			if (val.type.size===1) {s += " := '0';\n";}
			else {s += " := (others=>'0');\n";}
		} else {s += ";\n";}
	}
  });

  s += " constant T : time := " + clk_per + " ns;\n";
  s += "begin\n" + "\nuut: entity <b class='w3-text-brown'>work</b>."+comp_name+" port map(\n";

  if (isSequential()) {
      s += "	 clk => clk,\n";
      if (setup.rst) {
          s += "	 rst => rst,\n";
      }
  }
  model.ports.forEach(function (val, id) {
	var tip = "";
	var mod = val.mode;
	if (mod==="in" || mod==="out") {
        if (val.type.size===1) {tip = "std_logic";}
        else {
            if (setup.stdlogic) { tip = "std_logic_vector"; id = id+"_v";}
            else if (val.type.unsigned) tip = "unsigned";
            else tip = "signed";
        }
		if (first) { first=false; }
		else {s += ",\n"; }

		s += "	   "+id+" => "+id;
	}
  });
  s += "\n);\n";

  if (isSequential()) {
	s += "<span class='w3-text-green'>-- Clock generator\n</span>";
	s += "clk_gen: process\nbegin\n clk <= '1';  wait for T/2;\n clk <= '0';  wait for T/2;\nend process;\n";
  }

  s += "\nstim_proc: process\nbegin\n";
  if (isSequential()) { s += " wait for T/20;\n"; }
  if (setup.rst) {
       s += " rst <= '0';\n";
  }
      
  const cycles = getCycles();
  const vrstice = ports.length;
  let repeat = 0;
  let change = false;
  let wait = false;

  for (let c = 0; c < cycles; c++) {
	change = false;
	wait = false;

	for (let v = 0; v < vrstice; v++) {
		// koda le ob spremembi vrednosti pri in ali inOut signalih
		if (c==0 ||
		   ((ports[v].mode == "in" || ports[v].mode == "inOut") && signals[v][c] != signals[v][c-1])) {
//console.log("Cy: "+c+" change "+repeat);
		  if (c>0 && wait===false) {
			  if (repeat===0) {s += "\n wait for T;\n";}
			  else {s += "\n wait for "+(repeat+1)+"*T;\n";}
			  repeat = 0;
			  wait = true;
		  }
		  if (ports[v].mode == "in" || ports[v].mode == "inOut") {
			if (c>0) {change = true;}
			if(ports[v] instanceof Bit) s += " " + ports[v].name + " <= " + "'" + signals[v][c].valueOf()+ "'" +";";
			else {
				let bits = Number(signals[v][c]);
				if (bits<0) bits = bits & ( Math.pow(2, ports[v].size) - 1);
				bits = bits.toString(2);

                if (setup.stdlogic) { 
                    s += " " + ports[v].name + "_v <= " + "&quot" + pad(bits, ports[v].size) + "&quot" +"&#59;";
                } else {
                    s += " " + ports[v].name + " <= " + "&quot" + pad(bits, ports[v].size) + "&quot" +"&#59;";
                }
			}
		  }
		}
	}
	if (c>0 && change===false) {repeat += 1;}

  }
  s += "\n wait;\nend process;\nend sim;";

  document.getElementById("vhdllog").innerHTML = makeColor(makeBold(s));
}

function VCD2string() { // V33a
  let s = "";

  if (model) {
	if (model.changed()) {parseCode();} // recompile on change
  } else {
	 return s;
  }

  const d = new Date();
  s += "$date\n "+d.getDate() + "-" + (d.getMonth() + 1) + "-" + d.getFullYear()+"\n$end\n";
  s += "$version\n SHDL\n$end\n";
  
  const p = setup.clkPeriod;
  s += "$timescale 1ns $end\n";
  s += "$scope module "+model.name()+" $end\n";
  s += ""
  let wcode = 35;
  
  if (isSequential()) {
	s += "$var wire 1 "+String.fromCharCode(wcode)+" clk $end\n"; 
  }
  wcode += 1;

  let sigMap = new Map();

  model.ports.forEach(function (val, id) {
    sigMap.set(id, wcode);       
    s += "$var wire "+val.type.size+" "+String.fromCharCode(wcode)+" "+id+" $end\n";
    wcode += 1;
  });
  
  s += "$upscope $end\n$enddefinitions $end\n";
  s += "$dumpvars\n";
  
  const cycles = getCycles();
  const vrstice = ports.length;
  let repeat = 0;
  let change = false;
  let wait = false; 
  let bits = 0;

  for (let c = 0; c < cycles; c++) {
	change = false;
	wait = false;
    
	for (let v = 0; v < vrstice; v++) {
		// koda le ob spremembi vrednosti pri in ali inOut signalih
		if (c==0 || (signals[v][c] != signals[v][c-1])) {
		  if (c>0 && wait===false) {
              s+="#"+Number(c)*Number(p)+"\n";
			  repeat = 0;
			  wait = true;
		  }
          if (c>0) {change = true;}
          
          if(ports[v] instanceof Bit) s += signals[v][c].valueOf()+String.fromCharCode(sigMap.get(ports[v].name))+"\n";
		  else {
            let bits = Number(signals[v][c]);
			if (bits<0) bits = bits & ( Math.pow(2, ports[v].size) - 1);
			bits = bits.toString(2);
          
            s += "b"+bits+" "+String.fromCharCode(sigMap.get(ports[v].name))+"\n";
          }
		}
	}
	if (c>0 && change===false) {repeat += 1;}
      if (isSequential()) {
       s+="1#\n";

       s+="#"+(Number(c)*Number(p)+Number(p)/2)+"\n";
       s+="0#\n";
      }
  }
  s+="#"+Number(cycles)*Number(p)+"\n";

  return s;
}

function VCDout()
{
    setVHDL(VCD2string());
   //setVHDL(dump2string());
}
