"""Lossless command boundaries and explicit expression AST for PS2 CLANNAD."""
import hashlib
import re
from vnkit.disc import FormatError

TOKEN = re.compile(r'\s*(\d+|[FGZ]\[\d+\]|==|!=|>=|<=|&&|\|\||[()+\-*/<>!])')
PRECEDENCE = {'||':1,'&&':2,'==':3,'!=':3,'<':4,'>':4,'<=':4,'>=':4,'+':5,'-':5,'*':6,'/':6}


def expression(text):
    tokens=[];pos=0
    while pos < len(text):
        m=TOKEN.match(text,pos)
        if not m: raise FormatError(f'Unknown expression syntax at {pos}: {text!r}')
        tokens.append(m[1]);pos=m.end()
    at=0
    def parse(minimum=0):
        nonlocal at
        if at>=len(tokens): raise FormatError('Truncated expression')
        token=tokens[at];at+=1
        if token in ('!','-','+'):
            node={'unary':token,'value':parse(7)}
        elif token=='(':
            node=parse()
            if at>=len(tokens) or tokens[at]!=')': raise FormatError('Unclosed expression')
            at+=1
        elif token.isdigit(): node={'number':int(token,10)}
        elif re.fullmatch(r'[FGZ]\[\d+\]',token): node={'bank':token[0],'index':int(token[2:-1])}
        else: raise FormatError(f'Unexpected expression token {token}')
        while at<len(tokens) and PRECEDENCE.get(tokens[at],-1)>=minimum:
            op=tokens[at];at+=1
            node={'operator':op,'left':node,'right':parse(PRECEDENCE[op]+1)}
        return node
    result=parse()
    if at!=len(tokens): raise FormatError('Trailing expression tokens')
    return result


def parse_script(data, name):
    data.decode('cp932','strict')
    instructions=[];labels={};diagnostics=[];offset=0
    for raw in data.split(b';'):
        source_offset=offset;offset+=len(raw)+1
        value=raw.rstrip(b'\0').strip()
        if not value: continue
        if offset>len(data) and not raw.endswith(b'\0'):
            raise FormatError(f'{name}:{source_offset:#x}: missing command terminator')
        m=re.fullmatch(rb'_(Z[MYZ][0-9a-fA-F]{5}|[A-Z0-9_]{4})(.*)',value,re.S)
        op=m[1].decode('ascii') if m else 'legacy'
        arg=m[2].decode('cp932') if m else value.decode('cp932')
        item={'id':f'{name}:{source_offset:08x}','offset':source_offset,'length':len(raw)+1,'op':op,'argument':arg}
        if op.startswith(('ZM','ZZ','ZY')):
            if not arg.startswith('(') or not arg.endswith(')'): raise FormatError(f'{item["id"]}: malformed text/label')
            item.update(op=op[:2],tag=op[2:]);item['text' if op[:2]=='ZM' else 'label']=arg[1:-1]
            if op[:2]!='ZM' and arg[1:-1]:
                label=arg[1:-1]
                if label in labels: diagnostics.append({'id':item['id'],'issue':'duplicate label','label':label})
                else: labels[label]=len(instructions)
        elif op in ('IF__','EIF_','CALC'):
            try:
                if op in ('IF__','EIF_'):item['expression']=expression(arg)
                else:
                    assign=re.fullmatch(r'\s*([FGZ])\[(\d+)\](=|\+=|-=)(.*)',arg,re.S)
                    if not assign: raise FormatError('Unknown assignment target')
                    bank,index,operator,right=assign.groups()
                    item['assignment']={'bank':bank,'index':int(index),'operator':operator}
                    select=re.fullmatch(r'(SEL|SEB)\((.*)\)',right,re.S)
                    if select:
                        item['selection']={'kind':select[1],'options':select[2].split(',')}
                    else:item['expression']=expression(right)
            except FormatError as error:
                item['unsupported']=str(error);diagnostics.append({'id':item['id'],'issue':str(error)})
        elif op in ('IFJP','GOTO'):
            if not re.fullmatch(r'\s+\*[^\s]+',arg):raise FormatError(f'{item["id"]}: malformed jump')
            item['target']=arg.strip()[1:]
        else:
            if arg.startswith('(') and arg.endswith(')'):item['args']=arg[1:-1].split(',') if arg[1:-1] else []
            elif not arg:item['args']=[]
            else:
                item['unsupported']='Unknown command argument syntax'
                diagnostics.append({'id':item['id'],'issue':item['unsupported']})
        instructions.append(item)
    for i in instructions:
        if 'target' in i and i['target'] not in labels:
            diagnostics.append({'id':i['id'],'issue':'unresolved label','label':i['target']})
            i['unsupported']='Unresolved source label '+i['target']
    return {'format':'vnkit.clannad-script','version':1,'source':name,'encoding':'cp932','sha256':hashlib.sha256(data).hexdigest(),
            'instructions':instructions,'labels':labels,'diagnostics':diagnostics}
