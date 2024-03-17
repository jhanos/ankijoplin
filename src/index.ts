import joplin from 'api';
import { SettingItemSubType, SettingItemType, ToolbarButtonLocation } from 'api/types';


joplin.plugins.register({
	onStart: async function() {
		// eslint-disable-next-line no-console
		console.info('Anki Joplin flashcard plugin started!');
    
    // function used to manage anki
    function invoke(action, version, params={}) {
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.addEventListener('error', () => reject('failed to issue request'));
        xhr.addEventListener('load', () => {
          try {
            const response = JSON.parse(xhr.responseText);
            if (Object.getOwnPropertyNames(response).length != 2) {
              throw 'response has an unexpected number of fields';
            }
            if (!response.hasOwnProperty('error')) {
              throw 'response is missing required error field';
            }
            if (!response.hasOwnProperty('result')) {
              throw 'response is missing required result field';
            }
            if (response.error) {
              throw response.error;
            }
            resolve(response.result);
          } catch (e) {
            reject(e);
          }
        });

          xhr.open('POST', 'http://127.0.0.1:8765');
          xhr.send(JSON.stringify({action, version, params}));
      });
    }

    // Function used to create an error dialog when anki is not started
    async function createErrorDialog() {
      let dialog = joplin.views.dialogs;
      let handle = await dialog.create("errorDialog" + Date.now());
      await dialog.setButtons(handle, [
        {
          id: "cancel",
        },
      ]);
      await dialog.setHtml(
        handle,
        ` <h2>Anki Joplin Sync - Error :</h2>
          <p>Start anki with anki-connect</p> `
      );
      await joplin.views.dialogs.open(handle);
    }

    async function createFlashCard() {

      // Search all notes with tag anki
      let notes = await joplin.data.get(['search'],{query: "tag:anki", fields: ['id', 'title', 'body', 'updated_time', 'user_data']});

      //console.info(notes)

      // Loop on the notes and create flashcard if :: or ?\n is found
      for (let i = 0; i < notes.items.length; i++) {
        let element = notes.items[i];
        let title = element.title



        // pull the last anki sync from user_data , if not present set to 0
        const re = /anki=(\d+)/
        let flashCardUpdate = element.user_data.match(re)
        let flashCardLastUpdate = "0"
        if (flashCardUpdate != null) {
          flashCardLastUpdate = flashCardUpdate[1]
        }


        if (element.updated_time > flashCardLastUpdate) {
        
          // Test if anki is running
          var xhttp = new XMLHttpRequest();
          var error = 0;
          xhttp.open('GET', 'http://127.0.0.1:8765');
          xhttp.timeout = 2000;
          xhttp.ontimeout = function () {console.info("Error Dialog");createErrorDialog();error = 1;};
          xhttp.send();
          if (error != 0) { console.info("break");break }


          // Delete then Create deck named j_$title
          let deckTitle = `j_${title}`
          await invoke('deleteDecks', 6, {decks: [deckTitle], 'cardsToo': true});
          await invoke('createDeck', 6, {deck: deckTitle});


          console.info(`Generate anki cards for ${element.title} `)
          let now = Date.now() + 3000
          await joplin.data.put(['notes', element.id], null, { user_data: "anki=" + now });
          let lines = element.body.split(/\r?\n/)

          for (let j = 0; j < lines.length; j++) {
            let question = null
            let answer = null

            // search for cardflash declare with ::
            if (lines[j].match(/::/) != null) {
              let q = lines[j].match(/(.*)::/)
              if (q) { question = q[1] }
              let a = lines[j].match(/::(.*)/)
              if (a) { answer = a[1] }

              if ( a && q ) {
                console.info(`Generate flashcard with question=${question} AND answer=${answer}`)
                await invoke('addNote', 6, {'note': {'deckName': deckTitle, 'modelName': 'Basic', 'fields': {'Front': question, 'Back': answer}}});
              }
            }

            // search for cardflash declare with ?
            if (lines[j] == "?") {
              if (lines[j-1] && lines[j+1] && lines[j+2]) {
                question = lines[j-1]
                answer = ""
                //console.info(question)
                let k = j + 1
                while(lines[k] != "") {
                  answer += lines[k] + '<br/>'
                  k++
                }
                console.info(`Generate flashcard with question=${question} AND answer=${answer}`)
                await invoke('addNote', 6, {'note': {'deckName': deckTitle, 'modelName': 'Basic', 'fields': {'Front': question, 'Back': answer}}});
              }
            }

          }
        } else {
          console.info(`Skip note ${title}, ${element.updated_time} > ${flashCardLastUpdate}`)
        }
      }
    }

    // main

    // Create sync button
    await joplin.commands.register({
			name: 'sync2Anki',
			label: 'Create Flashcard and sync to anki',
			iconName: 'fas fa-file-export',
			execute: async () => {
        await createFlashCard()
			},
		});

    // Create purge user data button
		await joplin.commands.register({
			name: 'purgeUserData',
			label: 'Purge User Data',
			iconName: 'fas fa-eraser',
			execute: async () => {
        let notes = await joplin.data.get(['search'],{query: "tag:anki", fields: ['id', 'title', 'user_data']});
        for (let i = 0; i < notes.items.length; i++) {
          let element = notes.items[i];
				  console.info('Current value is: ' + element.title);
				  console.info('Current value is: ' + element.user_data);
          await joplin.data.put(['notes', element.id], null, { user_data: "" });
        }
			},
		});

    await joplin.views.toolbarButtons.create('sync2AnkiButton', 'sync2Anki', ToolbarButtonLocation.NoteToolbar);
		await joplin.views.toolbarButtons.create('purgeUserDataButton', 'purgeUserData', ToolbarButtonLocation.NoteToolbar);



    await createFlashCard();
	},
});
