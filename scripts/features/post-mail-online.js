  function openOnlineDtdPostWindow(){
    var mailWindowOwner=supabaseSessionOwner();
    function bar(){return '<div class="dtd-construction"><span>ONLINE TEST PHASE · UNDER CONSTRUCTION</span></div>';}
    function shell(){return '<div class="dtd-shell"><div class="dtd-sidebar"><button class="btn" id="dtd-compose">Compose</button><button class="btn" id="dtd-future">Note to Self</button><button class="btn dtd-folder active" data-folder="inbox">Inbox</button><button class="btn dtd-folder" data-folder="sent">Sent</button><button class="btn dtd-folder" data-folder="contacts">E-Buddies</button><div class="dtd-delivery-note"><b>Daily delivery · 8:00 AM</b></div></div><div class="dtd-main"><div class="dtd-heading">Connecting…</div></div></div>';}
    createWindow({title:'DtD Post Mail',extraClass:'dtd-win',initialLeft:74,initialTop:72,bodyHtml:'<div class="win-body">'+bar()+'<div style="padding:28px;text-align:center">Connecting to DtD Post Mail…</div></div>',type:'dtdmail',onClose:function(){detachPigeonFromMailWindow();pigeonIcon().classList.remove('mail-window-open');if(pigeonComposingActive)endPigeonComposing(false);},onMount:function(el){
      pigeonIcon().classList.add('mail-window-open');
      attachPigeonToMailWindow(el);
      var profile=null,folder='inbox',main=null,currentRows=[];
      function address(handle){return handle+'@desktopdiary.local';}
      function localDateString(d){return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10);}
      function todayString(){return localDateString(new Date());}
      function nextDeliveryDate(){var d=new Date(),cutoff=new Date(d);cutoff.setHours(8,0,0,0);if(d>=cutoff)d.setDate(d.getDate()+1);return localDateString(d);}
      function showError(message){el.querySelector('.win-body').innerHTML=bar()+'<div style="padding:22px;text-align:center;color:#9b1c1c;line-height:1.5">'+escapeHtml(message)+'</div>';}
      function loadProfile(){return ensureSupabaseSession().then(function(session){return supabaseRestRequest('dtd_profiles?select=handle,display_name&user_id=eq.'+encodeURIComponent(session.user.id)+'&limit=1');}).then(function(rows){if(supabaseSessionOwner()!==mailWindowOwner)throw new Error('Account changed. Reopen Post Mail.');return rows&&rows[0]||null;});}
      function showAddressSetup(){
        var suggestion=((state.mail.address||'').split('@')[0]||((state.account&&state.account.screenName)||'user')).toLowerCase().replace(/[^a-z0-9._-]+/g,'.').replace(/^[._-]+|[._-]+$/g,'').slice(0,20)||'user';
        el.querySelector('.win-body').innerHTML=bar()+'<div style="padding:18px;text-align:center"><div class="dtd-heading">Reserve your online DtD address</div><p style="font-size:11px;color:#555;line-height:1.45">This address will be unique across every connected DesktopDiary.</p><div style="display:flex;justify-content:center;align-items:center;gap:4px;margin:16px 0"><input id="dtd-online-handle" maxlength="20" value="'+escapeHtml(suggestion)+'" style="width:130px;padding:6px;text-align:right"><b style="font-size:11px">@desktopdiary.local</b></div><div class="signon-error" id="dtd-online-status"></div><button class="btn" id="dtd-online-reserve" style="padding:7px 16px">Check &amp; Reserve</button><div style="font-size:9px;color:#777;border-top:1px solid #ccc;margin-top:17px;padding-top:9px">Your private login email is never shown with your DtD address.</div></div>';
        var input=el.querySelector('#dtd-online-handle'),status=el.querySelector('#dtd-online-status'),button=el.querySelector('#dtd-online-reserve');
        button.onclick=function(){var handle=input.value.trim().toLowerCase();status.style.color='#555';status.textContent='Checking availability…';button.disabled=true;supabaseRpc('dtd_handle_available',{requested_handle:handle}).then(function(available){if(!available)throw new Error('That address is unavailable or invalid.');return supabaseRpc('reserve_dtd_address',{requested_handle:handle,requested_display_name:(state.account&&state.account.screenName)||''});}).then(function(){profile={handle:handle,display_name:(state.account&&state.account.screenName)||''};state.mail.onlineAddress=address(handle);saveState();mountMailbox();}).catch(function(err){status.style.color='';status.textContent=err.message;button.disabled=false;});};
        input.onkeydown=function(e){if(e.key==='Enter'){e.preventDefault();button.click();}};
      }
      function mountMailbox(){
        el.querySelector('.win-body').innerHTML=bar()+shell();main=el.querySelector('.dtd-main');state.mail.onlineAddress=address(profile.handle);saveState();syncAllDtdPublicContent().catch(function(){});
        el.querySelector('#dtd-compose').onclick=function(){showCompose('','');};
        el.querySelector('#dtd-future').onclick=function(){ beginPigeonComposing(); showPrivateLetterChoice(); };
        el.querySelectorAll('.dtd-folder').forEach(function(b){b.onclick=function(){setFolder(b.dataset.folder);};});
        loadFolder();
        var timer=setInterval(function(){if(folder==='inbox'&&new Date().getHours()>=8&&state.mail.lastOnlineDeliveryDate!==todayString())loadFolder(true);},60000),rec=openWindows.find(function(w){return w.el===el;});if(rec)rec.dtdDeliveryTimer=timer;
      }
      function setFolder(name){folder=name;el.querySelectorAll('.dtd-folder').forEach(function(b){b.classList.toggle('active',b.dataset.folder===name);});loadFolder();}
      function loadFolder(quiet){
        if(pigeonComposingActive)endPigeonComposing(false);
        if(folder==='contacts'){renderDtdContacts(main,function(handle){showCompose(handle,'');});return;}
        if(!quiet)main.innerHTML='<div class="dtd-heading">Loading '+escapeHtml(folder)+'…</div>';
        var serverBox=folder==='inbox'?'inbox':'sent';
        if(folder==='inbox'){
          var beforeDelivery=new Date().getHours()<8,alreadyDelivered=state.mail.lastOnlineDeliveryDate===todayString();
          if(beforeDelivery||alreadyDelivered){currentRows=Array.isArray(state.mail.onlineInboxCache)?state.mail.onlineInboxCache.slice():[];renderRows();if(beforeDelivery){var h=main.querySelector('.dtd-heading');if(h)h.insertAdjacentHTML('beforeend','<div style="font-size:9px;font-weight:normal;color:#666;margin-top:3px">Today’s delivery arrives at 8:00 AM.</div>');}return;}
        }
        supabaseRpc('get_dtd_mailbox',{box_name:serverBox,client_timezone:dtdClientTimezone()}).then(function(rows){if(supabaseSessionOwner()!==mailWindowOwner)return;var today=todayString();rows=rows||[];if(folder==='inbox')rows=updatePigeonOnlineInbox(rows,today,mailWindowOwner);else if(folder==='sent')rows=rows.filter(function(m){return !(m.from_handle===profile.handle&&m.to_handle===profile.handle&&m.deliver_on>String(m.created_at).slice(0,10));});currentRows=rows;renderRows();}).catch(function(err){if(supabaseSessionOwner()===mailWindowOwner)main.innerHTML='<div class="dtd-empty">'+escapeHtml(err.message)+'</div>';});
      }
      function deleteOnlineMailById(messageId){
        var before=currentRows.length;
        currentRows=currentRows.filter(function(item){return item.message_id!==messageId;});
        if(before===currentRows.length)return false;
        if(folder==='inbox'&&Array.isArray(state.mail.onlineInboxCache)){
          state.mail.onlineInboxCache=state.mail.onlineInboxCache.filter(function(item){return item.message_id!==messageId;});
        }
        saveState();
        refreshMailPigeonFromCache();
        renderRows();
        openInfoWindow('Message deleted.');
        return true;
      }
      function askToDeleteOnlineMessage(messageId){
        function doDelete(){
          if(!deleteOnlineMailById(messageId))return;
          supabaseRpc('delete_dtd_message',{message_id:messageId,client_timezone:dtdClientTimezone()}).catch(function(){});
        }
        if(window.appConfirm){
          window.appConfirm('Delete this message?',function(ok){
            if(!ok)return;
            doDelete();
          });
          return;
        }
        if(!window.confirm('Delete this message?'))return;
        doDelete();
      }
      function renderRows(){
        refreshMailPigeonFromCache();
        if(folder==='inbox')currentRows=sortDtdIncomingMail(currentRows,function(m){return !m.read_at;},function(m){return new Date(m.created_at||0).getTime();});
        var heading=folder==='inbox'?'Inbox':'Sent',unread=folder==='inbox'?currentRows.filter(function(m){return !m.read_at;}).length:0;
        main.innerHTML='<div class="dtd-heading">'+heading+(folder==='inbox'?' ('+unread+' unread)':'')+' <span style="float:right;font-weight:normal;font-size:9px">'+escapeHtml(address(profile.handle))+'</span></div><div class="dtd-list">'+(currentRows.length?currentRows.map(function(m){var who=folder==='inbox'?m.from_handle:m.to_handle,isDated=folder==='sent'&&m.deliver_on>String(m.created_at).slice(0,10),date=isDated?m.deliver_on:m.created_at,displayedDate=folder==='inbox'?(m.deliver_on||m.created_at):date,priv=decodeOnlinePrivateLetter(m,profile.handle),profileHandle=priv?profile.handle:who,whoLabel=priv?priv.displayRecipient:(mailPenPalNickname(who)||address(who)),writtenAt=m.created_at?new Date(m.created_at).getTime():0,whoHtml=priv&&priv.type==='future-self'?futureSelfLabelHtml(whoLabel,writtenAt):(priv?escapeHtml(whoLabel):(folder==='inbox'?mailAgedPartyHtml(whoLabel,writtenAt):escapeHtml(whoLabel))),subjectLabel=priv?priv.subject:m.message_subject;return '<div class="dtd-row'+(folder==='inbox'&&!m.read_at?' unread':'')+'" data-mail-id="'+escapeHtml(m.message_id)+'"><span class="dtd-mail-party" data-profile-handle="'+escapeHtml(profileHandle)+'"><button class="dtd-row-party-name" title="View profile">'+whoHtml+'</button></span><span class="dtd-subject">'+escapeHtml(subjectLabel||'(no subject)')+'</span><time>'+(isDated?'Delivers ':'')+escapeHtml(fmtDateShort(new Date(displayedDate).getTime()))+'</time><button class="dtd-row-delete" type="button" title="Delete message" aria-label="Delete message">🗑</button></div>';}).join(''):'<div class="dtd-empty">No messages here.</div>')+'</div>';
        main.querySelectorAll('[data-mail-id]').forEach(function(row){
          var rowId=row.dataset.mailId;
          row.onclick=function(){openMessage(rowId);};
          var deleteButton=row.querySelector('.dtd-row-delete');
          if(deleteButton){
            deleteButton.onclick=function(event){
              event.stopPropagation();
              askToDeleteOnlineMessage(rowId);
            };
          }
        });
        main.querySelectorAll('.dtd-mail-party').forEach(function(party){
          var handle=party.dataset.profileHandle,nameButton=party.querySelector('.dtd-row-party-name');
          function openProfile(e){e.preventDefault();e.stopPropagation();if(handle===profile.handle)openViewProfileWindow();else openDtdPublicProfileWindow(handle);}
          nameButton.onclick=openProfile;
        });
      }
      function openMessage(id){
        var m=currentRows.find(function(x){return x.message_id===id;});if(!m)return;
        if(folder==='inbox'&&!m.read_at){supabaseRpc('mark_dtd_message_read',{message_id:m.message_id,client_timezone:dtdClientTimezone()}).catch(function(){});m.read_at=new Date().toISOString();saveState();refreshMailPigeonFromCache();}
        var priv=decodeOnlinePrivateLetter(m,profile.handle);
        if(priv){
          var disclaimer=priv.type==='imaginary'?'<div style="padding:0 10px 8px;font-size:9px;font-weight:bold;color:#a3261e">This letter will never be sent to this person.</div>':'';
          var privateRecipientHtml=priv.type==='future-self'?futureSelfLabelHtml(priv.displayRecipient,new Date(m.created_at).getTime()):escapeHtml(priv.displayRecipient);
          var receivedTime=folder==='inbox'?(m.deliver_on||m.created_at):m.created_at;
          main.innerHTML='<div class="dtd-meta">'+
            '<b>'+escapeHtml(priv.subject||'(no subject)')+'</b><br>From: You<br>To: '+privateRecipientHtml+'<br>'+escapeHtml(scrapbookDate(new Date(receivedTime).getTime()))+'</div>'+disclaimer+
            '<div class="dtd-message">'+escapeHtml(m.message_body||'')+'</div>'+
            '<div style="padding:7px;border-top:1px solid #ccc;display:flex;justify-content:space-between"><button class="btn dtd-back">Back</button><span><button class="btn dtd-save-diary">Save to Diary</button> <button class="btn dtd-delete-mail">Delete</button></span></div>';
          main.querySelector('.dtd-back').onclick=renderRows;
          var saveDiaryButton=main.querySelector('.dtd-save-diary');
          var deleteMailButton=main.querySelector('.dtd-delete-mail');
          if(saveDiaryButton)saveDiaryButton.onclick=function(){saveDtdMailToDiary('online:'+m.message_id,priv.subject,'You',priv.displayRecipient,m.message_body,m.created_at);};
          if(deleteMailButton)deleteMailButton.onclick=function(){askToDeleteOnlineMessage(m.message_id);};
          return;
        }
        var profileHandle=folder==='inbox'?m.from_handle:m.to_handle,initials=(profileHandle||'?').slice(0,2).toUpperCase();
        var receivedTime=folder==='inbox'?(m.deliver_on||m.created_at):m.created_at;
        main.innerHTML='<div class="dtd-meta"><button class="dtd-profile-link" title="View '+escapeHtml(profileHandle)+'\'s profile">'+escapeHtml(initials)+'</button><b>'+escapeHtml(m.message_subject||'(no subject)')+'</b><br>From: '+escapeHtml(address(m.from_handle))+'<br>To: '+escapeHtml(address(m.to_handle))+'<br>'+(folder==='scheduled'?'Delivery: ':'')+escapeHtml(scrapbookDate(new Date(receivedTime).getTime()))+'</div><div class="dtd-message">'+escapeHtml(m.message_body||'')+'</div><div class="dtd-inline-reply" style="display:none"><input type="text" class="dtd-inline-reply-subject" placeholder="Subject" value="'+escapeHtml(m.message_subject||'')+'"><textarea class="dtd-inline-reply-body" placeholder="Write a fresh letter back…"></textarea><div class="dtd-inline-reply-actions"><span class="dtd-inline-reply-note">The previous letter will not be included.</span><span><button class="btn dtd-reply-cancel">Cancel</button> <button class="btn dtd-reply-send">Send Reply</button></span></div><div class="signon-error dtd-reply-error"></div></div><div style="padding:7px;border-top:1px solid #ccc;display:flex;justify-content:space-between"><button class="btn dtd-back">Back</button><span><button class="btn dtd-save-diary">Save to Diary</button> <button class="btn dtd-save-contact">Save E-Buddy</button> <button class="btn dtd-reply">Reply</button> <button class="btn dtd-delete-mail">Delete</button></span></div>';
        var profileButton=main.querySelector('.dtd-profile-link');profileButton.onclick=function(){if(profileHandle===profile.handle)openViewProfileWindow();else openDtdPublicProfileWindow(profileHandle);};
        var contactDisplayName='';
        supabaseRpc('get_dtd_public_profile',{requested_handle:profileHandle}).then(function(p){if(!p)return;contactDisplayName=p.display_name||'';if(p.profile_picture)profileButton.innerHTML='<img src="'+escapeHtml(p.profile_picture)+'" alt="">';}).catch(function(){});
        main.querySelector('.dtd-save-contact').onclick=function(){var contact=saveDtdContact(profileHandle,contactDisplayName);openInfoWindow(contact?'Saved to E-Buddies.':'That DtD address is not valid.');};
        main.querySelector('.dtd-save-diary').onclick=function(){saveDtdMailToDiary('online:'+m.message_id,m.message_subject,address(m.from_handle),address(m.to_handle),m.message_body,m.created_at);};
        main.querySelector('.dtd-delete-mail').onclick=function(){askToDeleteOnlineMessage(m.message_id);};
        var backButton=main.querySelector('.dtd-back'),reply=main.querySelector('.dtd-reply'),replyBox=main.querySelector('.dtd-inline-reply');
        if(backButton)backButton.onclick=renderRows;
        if(reply){
          if(!replyBox){
            reply.onclick=function(){showCompose(profileHandle,m.message_subject||'');};
          }else{
            var replyCancel=main.querySelector('.dtd-reply-cancel'),replySend=main.querySelector('.dtd-reply-send');
            reply.onclick=function(){replyBox.style.display='grid';reply.style.display='none';beginPigeonComposing();var replyText=replyBox.querySelector('textarea');if(replyText)replyText.focus();};
            if(replyCancel)replyCancel.onclick=function(){replyBox.style.display='none';reply.style.display='';endPigeonComposing(false);};
            if(replySend)replySend.onclick=function(){var bodyField=main.querySelector('.dtd-inline-reply-body'),body=bodyField?bodyField.value:'',text=body.trim(),sendButton=replySend,errorBox=main.querySelector('.dtd-reply-error'),subjectField=main.querySelector('.dtd-inline-reply-subject'),subject=subjectField?subjectField.value.trim():(m.message_subject||'');if(!text){if(errorBox)errorBox.textContent='Write your reply first.';return;}sendButton.disabled=true;supabaseRpc('send_dtd_message',{recipient_handle:profileHandle,message_subject:subject,message_body:body,delivery_date:nextDeliveryDate(),client_timezone:dtdClientTimezone()}).then(function(){trackDtdUsage('letter_sent');endPigeonComposing(true);openInfoWindow('Your reply is sealed and will be delivered at the next 8:00am.');setFolder('sent');}).catch(function(err){if(errorBox)errorBox.textContent=err.message;sendButton.disabled=false;});};
          }
        }
      }
      function recipientHandle(value){return value.trim().toLowerCase().split('@')[0];}
      function showCompose(to,subject){
        beginPigeonComposing();
        var recipient=recipientHandle(to||'');
        main.innerHTML='<div class="dtd-heading">New Online Message</div><div class="dtd-compose"><label><span>From</span><input value="'+escapeHtml(address(profile.handle))+'" readonly></label><label><span>To</span><span class="dtd-address-input"><input id="dtd-to" maxlength="20" value="'+escapeHtml(recipient)+'" placeholder="friend" autocomplete="off" autocapitalize="none" spellcheck="false"><span class="dtd-address-suffix">@desktopdiary.local</span></span></label><label><span>Subject</span><input id="dtd-subject" value="'+escapeHtml(subject||'')+'"></label>'+dtdDeliveryMenuHtml()+'<textarea id="dtd-body" placeholder="Plain text only…"></textarea><div class="dtd-compose-actions"><button class="btn dtd-compose-cancel">Cancel</button><button class="btn dtd-send">Send</button></div><div class="signon-error dtd-error"></div></div>';
        var resolveDeliveryDate=dtdWireDeliveryMenu(main);
        var toEl=main.querySelector('#dtd-to'),bodyEl=main.querySelector('#dtd-body'),send=main.querySelector('.dtd-send'),composeError=main.querySelector('.dtd-error');toEl.oninput=function(){toEl.value=toEl.value.toLowerCase().replace(/[^a-z0-9._-]/g,'');};main.querySelector('.dtd-compose-cancel').onclick=loadFolder;send.onclick=function(){var recipient=recipientHandle(toEl.value),text=bodyEl.value,date=resolveDeliveryDate();if(!recipient){if(composeError)composeError.textContent='Enter your friend\'s username.';return;}if(!date){if(composeError)composeError.textContent='Choose a delivery time.';return;}if(!text.trim()){if(composeError)composeError.textContent='Write a message first.';return;}send.disabled=true;supabaseRpc('send_dtd_message',{recipient_handle:recipient,message_subject:main.querySelector('#dtd-subject').value.trim(),message_body:text,delivery_date:date,client_timezone:dtdClientTimezone()}).then(function(){trackDtdUsage('letter_sent');endPigeonComposing(true);setFolder('sent');}).catch(function(err){if(composeError&&composeError.isConnected)composeError.textContent=err.message;send.disabled=false;});};setTimeout(function(){if((to?bodyEl:toEl).isConnected)(to?bodyEl:toEl).focus();},20);
      }
      function scheduleOnlinePrivateLetter(letterType,displayRecipient,resolveDeliveryDate,send){
        var date=resolveDeliveryDate(),text=main.querySelector('#dtd-body').value;
        if(!date){main.querySelector('.dtd-error').textContent='Choose a delivery time.';return;}
        if(!text.trim()){main.querySelector('.dtd-error').textContent='Write a message first.';return;}
        var rawSubject=main.querySelector('#dtd-subject').value.trim();
        var subjectToSend=letterType==='imaginary'?encodeImaginarySubject(displayRecipient,rawSubject):rawSubject;
        send.disabled=true;
        supabaseRpc('send_dtd_message',{recipient_handle:profile.handle,message_subject:subjectToSend,message_body:text,delivery_date:date,client_timezone:dtdClientTimezone()}).then(function(){trackDtdUsage('letter_sent');endPigeonComposing(true);openInfoWindow('Your letter is sealed. It will be delivered at 8:00am on '+new Date(date+'T08:00:00').toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'})+'.', 'Letter Sealed');setFolder('inbox');}).catch(function(err){main.querySelector('.dtd-error').textContent=err.message;send.disabled=false;});
      }
      function showFutureCompose(){
        // Bird already arrived when "Note to Self" was clicked (see
        // showPrivateLetterChoice caller) — don't retrigger the arrival here.
        main.innerHTML='<div class="dtd-heading">Note to Future Me</div><div class="dtd-compose"><label><span>To</span><input value="Future Me" readonly></label>'+dtdDeliveryMenuHtml()+'<label><span>Subject</span><input id="dtd-subject" placeholder="A note for later"></label><textarea id="dtd-body" placeholder="What would you like to receive later?"></textarea><div class="dtd-compose-actions"><button class="btn dtd-compose-cancel">Cancel</button><button class="btn dtd-schedule">Schedule</button></div><div class="signon-error dtd-error"></div></div>';
        var resolveDeliveryDate=dtdWireDeliveryMenu(main);
        main.querySelector('.dtd-compose-cancel').onclick=showPrivateLetterChoice;
        var send=main.querySelector('.dtd-schedule');
        send.onclick=function(){scheduleOnlinePrivateLetter('future-self',null,resolveDeliveryDate,send);};
      }
      function showImaginaryCompose(){
        // Bird already arrived when "Note to Self" was clicked (see
        // showPrivateLetterChoice caller) — don't retrigger the arrival here.
        main.innerHTML='<div class="dtd-heading">Anybody</div><div class="dtd-compose"><label><span>To</span><input id="dtd-imaginary-to" type="text" placeholder="e.g. My Boss, Mom, The Universe"></label>'+dtdDeliveryMenuHtml()+'<label><span>Subject</span><input id="dtd-subject" placeholder="A letter you need to write"></label><textarea id="dtd-body" placeholder="Say what you need to say…"></textarea><div style="font-size:9px;font-weight:bold;color:#a3261e">This letter will never be sent to this person.</div><div class="dtd-compose-actions"><button class="btn dtd-compose-cancel">Cancel</button><button class="btn dtd-schedule">Schedule</button></div><div class="signon-error dtd-error"></div></div>';
        var resolveDeliveryDate=dtdWireDeliveryMenu(main);
        main.querySelector('.dtd-compose-cancel').onclick=showPrivateLetterChoice;
        var send=main.querySelector('.dtd-schedule');
        send.onclick=function(){
          var to=main.querySelector('#dtd-imaginary-to').value.trim();
          if(!to){main.querySelector('.dtd-error').textContent='Enter who this letter is to.';return;}
          scheduleOnlinePrivateLetter('imaginary',to,resolveDeliveryDate,send);
        };
      }
      function showPrivateLetterChoice(){
        // Note: no endPigeonComposing here — the bird should stay put for the
        // whole Note to Self flow (choice screen <-> Future Me/Anybody), not
        // fly off and back again every time you go back to this screen.
        main.innerHTML='<div class="dtd-heading">Note to Self</div><div class="dtd-compose" style="text-align:center"><p style="font-size:11px;color:#555;line-height:1.5;text-align:left;margin:0">Private letters stay with you. Choose the kind of letter to write.</p><button class="btn" id="dtd-private-futureself" style="padding:10px">Future Me</button><button class="btn" id="dtd-private-imaginary" style="padding:10px">Anybody</button><div class="dtd-compose-actions"><button class="btn dtd-compose-cancel">Cancel</button></div></div>';
        main.querySelector('.dtd-compose-cancel').onclick=loadFolder;
        main.querySelector('#dtd-private-futureself').onclick=showFutureCompose;
        main.querySelector('#dtd-private-imaginary').onclick=showImaginaryCompose;
      }
      loadProfile().then(function(found){profile=found;if(profile)mountMailbox();else showAddressSetup();}).catch(function(err){showError(err.message);});
    }});
  }
