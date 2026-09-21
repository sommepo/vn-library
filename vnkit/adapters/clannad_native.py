"""Recover this executable edition's lookup tables; never copy them into code."""
import hashlib
import struct
from vnkit.disc import FormatError
from vnkit.elf import Elf32


def verify_executable(executable):
    if hashlib.sha256(executable).hexdigest()!='1fee7a7a08db470b811e287103038f3f158a4d59c36246449c176ecc208c073a':
        raise FormatError('Untested CLANNAD executable revision; native table addresses require investigation')


def recover(executable, entries, read_member=None):
    verify_executable(executable)
    elf=Elf32(executable)
    def string(address):return elf.at(address,128).split(b'\0',1)[0].decode('cp932','strict') if address else None
    def pointer(address):return struct.unpack('<I',elf.at(address,4))[0]
    def names(base,count):return [elf.at(base+i*32,30).split(b'\0',1)[0].decode('cp932','strict') for i in range(count)]
    first={}
    for e in entries:first.setdefault(e['name'].lower(),e)
    def asset(name):
        if name.lower() not in first:raise FormatError(f'Native table references absent resource {name}')
        return first[name.lower()]['index']
    entry=string(pointer(0x378158)).upper()
    if entry!='SEEN0414.MZX':raise FormatError('Unexpected executable initial script')
    backgrounds={};anchor=asset(string(pointer(0x1cfdd8)))+1
    for i,name in enumerate(names(0x1ffa00,0x20a)):
        e=entries[anchor+i*2]
        if e['name'].rsplit('.',1)[0].lower()!=name.lower():raise FormatError('Background table/ALLPAC ordering mismatch')
        backgrounds[name.lower()]={'index':i,'archive_index':e['index'],'source':e['path']}
    sprites={}
    sprite_names=names(0x203b70,0x497)
    for i,name in enumerate(sprite_names):
        key,body,face,x,y,bodyCache,faceCache,variants=struct.unpack('<8i',elf.at(0x1c6ad8+i*32,32))
        if string(key).lower()!=name.lower():raise FormatError('Sprite native table identity mismatch')
        sprites[name.lower()]={'index':i,'body_index':asset(string(body)), 'face_index':asset(string(face)) if face else None,
                              'face_x':x,'face_y':y,'variants':variants,'address':0x1c6ad8+i*32}
    substitutions={}
    for char,base,count in [('Ａ',0x377940,3),('Ｂ',0x377950,2),('Ｃ',0x377958,2),('Ｄ',0x377960,2),('Ｅ',0x377968,2),('Ｆ',0x377970,2)]:
        substitutions[char]=[string(pointer(base+i*4)) for i in range(count)]
    events={}
    event10=struct.unpack('<21I',elf.at(0x1f9060+10*84,84))
    if event10[17:]!=(0x13b580,0x13b5d0,0x13b880,0x13ba50):raise FormatError('Native event 10 callbacks differ')
    def floats(address,n):return list(struct.unpack('<'+'f'*n,elf.at(address,4*n)))
    events['10']={'kind':'actor-swing','asset':f'image:{asset(string(event10[1]))}',
        'lower_pixels':pointer(0x13b63c)&65535,'lower_frames':pointer(0x13b640)&65535,
        'y_scale':floats(0x3c3e90,1)[0]/floats(0x3c3e94,1)[0],
        'hold_position':floats(0x3c3eb4,2),'pivot':[floats(0x3c3eb4,1)[0],floats(0x3c3ebc,1)[0]],
        'spin_position':[floats(0x3c3eb4,1)[0],floats(0x3c3ec0,1)[0]],
        'cycle_frames':pointer(0x13b75c)&65535,'sound_frame':pointer(0x13b734)&65535,
        'angle_units_per_frame':pointer(0x13b988)&65535,'radians_per_unit':floats(0x3b1c84,1)[0],
        'exit_frames':[13,35],'sound_name':string(0x3c3e88).upper(),
        'evidence':{'init':event10[17],'update':event10[18],'draw':event10[19],'end':event10[20],'signal':0x139730,'text_wait':0x14b980}}
    # Event 9 clears actor zero, draws a colour/mask pair about the bottom-right
    # anchor, then retires at counter 66. Values come from this verified ELF.
    event9=struct.unpack('<21I',elf.at(0x1f9060+9*84,84))
    if event9[17:]!=(0x13b3e8,0x13b420,0x13b478,0x13b568):raise FormatError('Native event 9 callbacks differ')
    event_asset=first[string(event9[1]).lower()]
    hold=pointer(0x13b4a8)&65535
    retire=pointer(0x13b430)&65535
    step=pointer(0x13b4b0)&65535
    pivot=list(struct.unpack('<2f',elf.at(0x3c3e7c,8)))
    if (hold,retire,step,pivot)!=(30,66,500,[640.0,480.0]):raise FormatError('Native event 9 motion constants differ')
    events['9']={'kind':'actor-rotation','asset':f'image:{event_asset["index"]}',
        'hold_frames':hold,'duration_frames':retire+1,'angle_units_per_frame':-step,
        'radians_per_unit':struct.unpack('<f',elf.at(0x3b1c84,4))[0], 'pivot':pivot,
        'clear_actor_at_end':True,'source':event_asset['path'],'source_sha256':event_asset['sha256'],
        'evidence':{'init':event9[17],'update':event9[18],'draw':event9[19],'end':event9[20],
                    'anchor_x':0x1c17f8+8*4,'anchor_y':0x1c1828+8*4,'rotation':0x118c2c}}
    event75=struct.unpack('<21I',elf.at(0x1f9060+75*84,84))
    if event75[17:]!=(0x143ea8,0x143f68,0x144130,0x144298):raise FormatError('Native interlude callbacks differ')
    variants=[]
    for i in range(14):
        white=bool(pointer(0x1ff008+i*4));final='siro' if white else 'kuro'
        variants.append({'background':f'image:{asset(string(pointer(0x1fef98+i*4)))}',
                         'strip':f'image:{asset(string(pointer(0x1fefd0+i*4)))}',
                         'white':white,'final_background':f'image:{backgrounds[final]["archive_index"]}'})
    events['75']={'kind':'eyecatch','variants':variants,
        'wait_frames':[pointer(0x143fa8)&65535,pointer(0x144068)&65535,pointer(0x144104)&65535],
        'fade_steps':list(struct.unpack('<2f',elf.at(0x3c5074,8))),
        'strip_last_counter':pointer(0x144048)&65535,
        'crop':list(struct.unpack('<4h',elf.at(0x1ff040,8))),
        'position':list(struct.unpack('<2f',elf.at(0x3c5098,8))),
        'evidence':{'init':event75[17],'update':event75[18],'draw':event75[19],'end':event75[20],
                    'tables':[0x1fef98,0x1fefd0,0x1ff008],'background_setter':0x14f748}}
    if read_member:
        e=first['sshren00.bin'];data=read_member(e['path'])
        if hashlib.sha256(data).hexdigest()!=e['sha256'] or len(data)%16:raise FormatError('Native animation table fingerprint/shape mismatch')
        event30=struct.unpack('<21I',elf.at(0x1f9060+30*84,84))
        if event30[17:]!=(0x13fa90,0x13fad0,0x13fb70,0x13fb78):raise FormatError('Native event 30 callbacks differ')
        if (pointer(0x13fad4)&65535,pointer(0x13fadc)&65535)!=(155,168):raise FormatError('Native event 30 frame range differs')
        for event,start,end,clear in [(23,0,5,False),(24,6,61,True),(30,155,168,True)]:
            frames=[]
            for index in range(start,end+1):
                number,valid,x,y,ms,alpha,u,v=struct.unpack_from('<8h',data,index*16)
                if number!=index or ms<0 or (ms==0 and (valid>=0 or index!=end)):raise FormatError('Native motion frame indexing/duration mismatch')
                frames.append({'ms':ms,'x':x if valid>=0 else None})
            events[str(event)]={'kind':'actor-x-motion','frames':frames,'clear_actor_at_end':clear,'source':e['path'],'source_sha256':e['sha256'],
                                'evidence':{'lookup':0x1392c0,'update':{23:0x13f350,24:0x13f438,30:0x13fad0}[event],'setter':0x12c500}}
            if event==30:events[str(event)]['present_buffer']=True
    return {'format':'vnkit.clannad-native','version':1,'entry':entry,'events':events,
            # DDAT dispatcher 0x14b720 searches these 63 fixed-width names.
            # Each original MRG is an already composited colour/mask date badge.
            'calendar':{name:f'image:{asset(name+".MRG")}' for name in names(0x20ce80,63)},
            'initial_f':{'500':1},  # 0x147ac0 clears F/Z; 0x147b48 sets F[500].
            'default_names':{'family':string(pointer(0x377934)),'first':string(pointer(0x377938))},
            'name_substitutions':substitutions,
            'basic_events':{
                '0':{'final_background':string(0x3c3dc8),'global_flag':46},
                '17':{'final_background':string(0x3c4188),'sound_name':string(0x3c4180)},
                '18':{'sound_name':string(0x3c41c8)},
                '19':{'final_background':string(0x3c4260),'global_flag':41,'stop_music':True,'clear_actors':True},
                '20':{'final_background':string(0x3c4260),'global_flag':44,'stop_music':True,'clear_actors':True},
                '21':{'final_background':string(0x3c4260),'global_flag':42,'stop_music':True,'clear_actors':True},
                '62':{'notices':[string(pointer(0x1fc9a8+i*4)) for i in range(2)],'sound_name':string(0x3c4a90)},
                '14':{'notices':[string(pointer(0x1fc898+i*4)) for i in range(7)],'sound_variants':[string(pointer(0x1fc8d8+pointer(0x1fc8b8+i*4)*4)) for i in range(7)]},
                '70':{'buffer_text':string(pointer(0x1fc9b0)+10)},
                '71':{'buffer_text':string(pointer(0x1fc9b8+15*4))},
                '72':{'clear_background':True,'stop_music':True},
                '74':{'final_background':string(0x3c4ef0),'music':49,'clear_actors':True},
                '77':{'prompt_asset':f'image:{asset(string(0x3c50a8))}'},
                '78':{},
            },
            'name_filter':[string(pointer(0x377978+i*4)) for i in range(10)],
            'special_choices':[string(pointer(0x3778b8+i*4)) for i in range(15)],'backgrounds':backgrounds,'sprites':sprites,
            'music':{name:i for i,name in enumerate(names(0x1ff330,0x35))},
            'evidence':{'executable_sha256':hashlib.sha256(executable).hexdigest(),'entry_pointer':0x378158,
                        'background_names':0x1ffa00,'background_load':0x12d910,'sprite_names':0x203b70,
                        'sprite_table':0x1c6ad8,'sprite_load':0x12c864,'music_names':0x1ff330,
                        'music_lookup':0x14cb78,'voice_bank_split':0x11d338,'text_substitution':0x147178}}
