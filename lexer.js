/*File: lexer.js, HL model lexer */
/*jshint esversion: 6 */

function isIDStart(ch) {
 return (ch === "_") || (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z");
}

function isIDchar(ch) {
 return (ch === "_") || (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || 
        ((ch >= "0") && (ch <= "9"));
}

function isDigit(ch) {
 return (ch >= "0" && ch <= "9");
}

function isHexDigit(ch) {
 return (ch >= "0" && ch <= "9") || (ch >= "a" && ch <= "f") || (ch >= "A" && ch <= "F");
}

function isComparisonOp (s) {
 if (typeof s === "string") return s.match(/^(>|<|==|>=|<=|!=)$/);
 return false;
}

function Token(tokenName, tokenType, position, numFormat) {
 const id = tokenName;
 const type = tokenType;
 const xy = position;
 const fmt = numFormat;  // number format: d|b|h + digit count
 
 function isID() {return (type==="id");}
 function isTypeID() {
	 if (type!=="id") return false;
	 if (/^(s|u)([0-9]*)$/.test(id)) return true; // correct pattern
	 return false;
 }
  
 function isNum() {return (type==="num");} 
 function isString() {return (type==='"');}
 function isAssign() {return (type==="=");} 
 function isOp() {return (type==="op");}
 
 function isSeparator(){return (type==="\n") || (type===";") || (type==="\t");}
 function isEOF() {return (type==="");}
 function isComparison() {return (type==="co");}
 
 function isVHD() {return (type==="v");}
 
 function emit() {return "("+id+"."+type+" "+xy.y+":"+xy.x+")";}
 function pos() {
	return xy.y+":"+xy.x;
 }
 function format() { return fmt; }
// console.log("Token: '"+id+"' "+position.y+","+position.x); 
 
 return {id, isVHD, isID, isTypeID, isNum, isString, isAssign, isOp, isSeparator, isEOF, isComparison, emit, pos, format};
}


function Lexer(txt) {
	const str = txt;
	const len = txt.length;
	let nextCh = ((len > 0) ? str.charAt(0) : "");
	let index = 0;
	let pos = {x:0, y:1};
	let token = new Token("", "", pos);
	let look = new Token("", "", pos);

	function getCh() {
		let c = nextCh;
		index += 1;
		if (index < len) {
			nextCh = str.charAt(index);
			pos.x += 1;
		} else {
			nextCh = "";
		}
		return c;
	}
	
	function peekCh() {
		let i = index + 1;
		if (i < len) { return str.charAt(i); }
		else { return ""; }
	}
	
	function skipSpace() {
		if (index>=len) {return;}
		if (nextCh===" " || nextCh==="\t") {
			while (nextCh===" " || nextCh==="\t") {getCh();}
		}	
	}

	function scan() {	
		let z;
		const pos0 = Object.assign({}, pos);
		
		token = look;
		if (index>=len) { // end of source
		    look = new Token("e", "", pos0);
			return;
		}		
		
		if (nextCh==="-") { // test for line comment
			getCh();
			if (nextCh==="-") {	// skip comment
				while (index<len && nextCh!=="\n") {getCh();}
			} else {
				look = new Token("-", "op", pos);
				skipSpace();
				return;
			}
		} else if (nextCh==="/") { // and block comment
			getCh();
			if (nextCh==="*") {	// skip comment /* 
				getCh();
				var currentCh = "";
				while (index<len && !(currentCh==="*" && nextCh==="/")) {
					currentCh = nextCh;
                    if (nextCh==="\n") { pos.y+=1; pos.x=0; } // count new lines
					getCh();					
				}
				getCh(); // skip last */
			} else if (nextCh==="=") {	// relation /=
                look = new Token("!=", "v", pos);
                getCh(); 
                skipSpace(); 
                return;
            } else {  // division operator !!
				look = new Token("/", "op", pos);
				skipSpace();
				return;
			}
		}
		
		if (isDigit(nextCh)) {			
			z = getCh();
			if ((z==="0") && (nextCh==="x" || nextCh==="X")) { // HEX 0x ?
			   getCh();
			   z = "";
			   while (isHexDigit(nextCh)) {z += getCh();}
			   if (z!=="") { look = new Token(parseInt(z, 16), "num", pos0, "h"+z.length); } 
			   else { look = new Token("0x", "?", pos0); }
			} else if ((z==="0") && (nextCh==="b" || nextCh==="B")) { // BIN ?
			   getCh();
			   z = "";
			   while (nextCh==="0" || nextCh==="1") {z += getCh();}
			   if (z!=="") { look = new Token(parseInt(z, 2), "num", pos0, "b"+z.length); } //TODO save number size!
			   else { look = new Token("0b", "?", pos0); }
			} else {			
			  while (isDigit(nextCh)) {z += getCh();}
			  look = new Token(z, "num", pos0, "d"+z.length);			  
			}
		} else if (nextCh==='"') {
                getCh(); // consume parenthesis
                z = "";			
                while (nextCh==="0" || nextCh==="1") {z += getCh();}
                const parenth = getCh();
			/*if (parenth!=='"') {
				throw parseErr("Unterminated string!", id)
			}*/
                if (parenth==='"' && z!=="") { look = new Token(parseInt(z, 2), "num", pos0, "b"+z.length); } //TODO save number size!
                else { look = new Token(z, '"', pos0); }            
		} else if (nextCh==="'") {	
			getCh(); // consume single parenthesis			
			z = "";
			if (nextCh==="0" || nextCh==="1") {z += getCh();}			
			const parenth = getCh();
			/*if (parenth!=='"') {
				throw parseErr("Unterminated string!", id)
			}*/
			if (parenth==="'" && z!=="") { look = new Token(parseInt(z, 2), "num", pos0, "b1"); } 
		    else { look = new Token(z, '"', pos0); }
		} else if (isIDStart(nextCh)) {
			if (nextCh==="x" || nextCh==="X") { // test x"hex"
                z = getCh();
                
                if  (nextCh==='"') { // hex string
                    getCh();
                    z = "";
			        while (isHexDigit(nextCh)) {z += getCh();}
                    const parenth = getCh();
                    
                    if (parenth==='"' && z!=="") { look = new Token(parseInt(z, 16), "num", pos0, "h"+z.length); } 
                    else { look = new Token(z, "?", pos0); }
                } else { // identifier with x
                    while (isIDchar(nextCh)) {z += getCh();}
                    if (z==="xor") { 
                        look = new Token("^", "v", pos0); 
                    } else if (z==="xnor") { 
                        look = new Token("~^", "v", pos0);
                    } else { 
                        look = new Token(z, "id", pos0); 
                    }
                }
            } else {
                z = getCh();
                while (isIDchar(nextCh)) {z += getCh();}
                switch (z) {
                    case "downto": look = new Token(":", "v", pos0); break;
                    case "sll": look = new Token("<<", "v", pos0); break;
                    case "srl": look = new Token(">>", "v", pos0); break;
                    case "and": look = new Token("&", "v", pos0); break;
                    case "or":  look = new Token("|", "v", pos0); break;
                    case "not":  look = new Token("~", "v", pos0); break;
                    case "xor": look = new Token("^", "v", pos0); break;
                    case "if": look = new Token("if", "if", pos0); break;
                    case "else": look = new Token("else", "else", pos0); break;
                    case "elsif": look = new Token("elsif", "elsif", pos0); break;
                    case "when": look = new Token("when", "when", pos0); break;
                    default: look = new Token(z, "id", pos0);
                }    
            }
			
		} else {
			if (nextCh==="\n") {				
				getCh(); // read new line
				look = new Token("\n", "\n",pos); 				
				pos.y+=1; pos.x=0;
			}
			else { // operators
				if (nextCh==="=") {
					if (peekCh()==="=") {						
						look = new Token("==", "co", pos);
						getCh(); getCh();
					} else {
						look = new Token("=", "=", pos);
						getCh();
					}
				} else if (nextCh===";") {
					look = new Token(";", ";", pos);
					getCh();
					
				} else if (nextCh==="<") {
					if (peekCh()==="=") {
						look = new Token("<=", "=", pos);
						getCh(); getCh();
					} else if (peekCh()==="<") {
						look = new Token("<<", "<<", pos);
						getCh(); getCh();
					} else {
						look = new Token("<", "co", pos);
						getCh();
					}
				} else if (nextCh===">") {
					if (peekCh()==="=") {
						look = new Token(">=", "co", pos);
						getCh(); getCh();
					} else if (peekCh()===">") {
						look = new Token(">>", ">>", pos);
						getCh(); getCh();
					} else {
						look = new Token(">", "co", pos);
						getCh();
					}
				} else if (nextCh==="!") {
					if (peekCh()==="=") {
						look = new Token("!=", "co", pos);
						getCh(); getCh();
					} else {
						look = new Token("!", "?", pos);
						getCh();
					}
				} else if (nextCh==="&") {
					if (peekCh()==="&") {
						look = new Token("&&", "bo", pos);
						getCh(); getCh();
					} else {
						look = new Token(",", "?", pos);
						getCh();
					}
				} else if (nextCh==="|") {
					if (peekCh()==="|") {
						look = new Token("||", "bo", pos);
						getCh(); getCh();
					} else {
						look = new Token("|", "?", pos);
						getCh();
					}					
				} else if (nextCh==="+" || nextCh==="*") {
					look = new Token(nextCh, "op", pos);
					getCh();						
				} else if (nextCh==="{" || nextCh==="}") {
					look = new Token(nextCh, nextCh, pos); // type: { or }
					getCh();					
			    } else { // vse ostalo
					look = new Token(nextCh, "?", pos);
					getCh();					
				}  
			}			
		}
		
		skipSpace();
				
	}
	
	function current() { return token; }
	function peek() { return look; }
	
	function consume() {
		let savedToken = token;
		scan();
		return savedToken;
	}	

	skipSpace(); // V31 skip initial space
	scan();
	scan();	
	return {current, peek, consume};
}