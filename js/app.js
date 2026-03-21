// js/app.js
// ================================================================
// Section 1: Supabase Client Initialization
// ================================================================

// The supabase global object is made available by the CDN script
// loaded in the head element of index.html.
const { createClient } = supabase

const SUPABASE_URL      = 'https://phhhvkdywzdmhumcvaxx.supabase.co'
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_p-DYpHcLuXbKPcz9S0w9DQ_CNytcrzV'

const db = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)

// Vercel Blob storage base URL
// Update this with your actual Vercel Blob domain from the upload script output
const BLOB_BASE_URL = localStorage.getItem('blobUrl') || 'https://ubkbezlqyaawcxrm.public.blob.vercel-storage.com';

// ================================================================
// Section 2: Application State
// ================================================================

// currentProfileId holds the UUID of the profile currently shown
// in the centre panel. It is null when no profile is selected.
// Every operation that acts on the selected profile checks this
// value before issuing a Supabase query.
let currentProfileId = null

// ================================================================
// Section 3: Helper Functions
// ================================================================

/**
 * setStatus(message, isError)
 * Displays a message in the status bar at the bottom of the page.
 * When isError is true, the bar turns red to alert the user.
 * When isError is false (default), the bar is blue.
 */
function setStatus(message, isError = false) {
  const bar     = document.getElementById('status-message')
  const footer  = document.getElementById('status-bar')
  bar.textContent            = message
  footer.style.background = isError ? '#6b1a1a' : 'var(--clr-status-bg)'
  footer.style.color = isError ? '#ffcccc' : 'var(--clr-status-text)'
}

/**
 * clearCentrePanel()
 * Resets the centre panel to its default empty state.
 * Called after a profile is deleted or when a search returns no result.
 */
function clearCentrePanel() {
  document.getElementById('profile-pic').src       = 'resources/images/default.png'
  document.getElementById('profile-name').textContent = 'No Profile Selected'
  document.getElementById('profile-status').textContent = '--'
  document.getElementById('profile-quote').textContent  = '--'
  document.getElementById('friends-list').innerHTML     = ''
  currentProfileId = null
}

/**
 * displayProfile(profile, friends)
 * Renders a profile object and its friends array into the centre panel.
 * profile: a row object from the profiles table.
 * friends: an array of friend rows with a nested profiles object for the name.
 */
function displayProfile(profile, friends = []) {
  let picturePath = 'resources/images/default.png';
  
  if (profile.picture) {
    // Get just the filename (remove any path prefixes)
    const filename = profile.picture.split('/').pop();
    
    // Convert old PNG/JPG extensions to WebP if needed
    let webpName = filename.replace(/\.(png|jpg|jpeg)$/i, '.webp');
    
    // Construct full Vercel Blob URL
    picturePath = `${BLOB_BASE_URL}/avatars/${webpName}`;
    
    // Debug logging
    console.log('Image Loading Debug:');
    console.log('  Original filename from DB:', profile.picture);
    console.log('  Extracted filename:', filename);
    console.log('  WebP name:', webpName);
    console.log('  Full Blob URL:', picturePath);
    console.log('  BLOB_BASE_URL:', BLOB_BASE_URL);
  }
  
  document.getElementById('profile-pic').src = picturePath
  document.getElementById('profile-name').textContent   = profile.name
  document.getElementById('profile-status').textContent =
    profile.status || '(no status)'
  document.getElementById('profile-quote').textContent  =
    profile.quote  || '(no quote)'
  currentProfileId = profile.id
  renderFriendsList(friends)
  setStatus(`Displaying ${profile.name}.`)
}

/**
 * renderFriendsList(friends)
 * Builds the friends list HTML inside the centre panel.
 * Each item in the friends array has a nested profiles object
 * whose name property holds the friend's display name.
 */
function renderFriendsList(friends) {
  const list = document.getElementById('friends-list')
  list.innerHTML = ''
  if (friends.length === 0) {
    list.innerHTML =
      '<p class="empty-state small text-muted">No friends yet.</p>'
    return
  }
  friends.forEach(f => {
    const div = document.createElement('div')
    div.className   = 'friend-entry'
    div.textContent = f.name  // f.name directly from bidirectional query
    list.appendChild(div)
  })
}

// ================================================================
// Section 4: CRUD Functions
// ================================================================

/**
 * loadProfileList()
 * Fetches all profile ids and names from Supabase, sorted by name,
 * and renders them as clickable buttons in the left panel.
 */
async function loadProfileList() {
  try {
    const { data, error } = await db
      .from('profiles')
      .select('id, name, picture')
      .order('name', { ascending: true })

    if (error) throw error

    const container = document.getElementById('profile-list')
    container.innerHTML = ''

    if (data.length === 0) {
      container.innerHTML =
        '<p class="text-muted small fst-italic p-2">No profiles found.</p>'
      return
    }

    data.forEach(profile => {
      const btn = document.createElement('button')
      btn.className   = 'profile-item btn btn-sm btn-outline-secondary w-100 text-start mb-1'
      btn.dataset.id  = profile.id
      
      // Create profile picture thumbnail
      const img = document.createElement('img')
      let picturePath = 'resources/images/default.png'
      
      if (profile.picture) {
        // Get just the filename (remove any path prefixes)
        const filename = profile.picture.split('/').pop();
        
        // Convert old PNG/JPG extensions to WebP if needed
        let webpName = filename.replace(/\.(png|jpg|jpeg)$/i, '.webp');
        
        // Construct full Vercel Blob URL
        picturePath = `${BLOB_BASE_URL}/avatars/${webpName}`;
      }
      
      img.src = picturePath
      img.alt = profile.name
      img.className = 'profile-list-thumb'
      
      // Create name span
      const nameSpan = document.createElement('span')
      nameSpan.textContent = profile.name
      nameSpan.className = 'profile-list-name'
      
      btn.appendChild(img)
      btn.appendChild(nameSpan)
      btn.addEventListener('click', () => selectProfile(profile.id))
      container.appendChild(btn)
    })

  } catch (err) {
    setStatus(`Error loading profiles: ${err.message}`, true)
  }
}

/**
 * selectProfile(profileId)
 * Fetches the full profile data and friend list for the given UUID,
 * highlights the matching item in the left panel list, and renders
 * the profile in the centre panel.
 */
async function selectProfile(profileId) {
  try {
    // Highlight the active item in the profile list
    document.querySelectorAll('#profile-list .profile-item')
      .forEach(el => {
        el.classList.toggle('active', el.dataset.id === profileId)
      })

    // Fetch the full profile row by primary key
    const { data: profile, error: profileError } = await db
      .from('profiles')
      .select('*')
      .eq('id', profileId)
      .single()

    if (profileError) throw profileError

    // Fetch friends relationships
    const { data: friendsRaw, error: friendsError } = await db
      .from('friends')
      .select('profile_id, friend_id')
      .or(`profile_id.eq.${profileId},friend_id.eq.${profileId}`)

    if (friendsError) throw friendsError

    // Process friends data to get the correct friend IDs and fetch their names
    const friendIds = friendsRaw ? friendsRaw.map(f => {
      // If current profile is profile_id, the friend is friend_id, and vice versa
      return f.profile_id === profileId ? f.friend_id : f.profile_id
    }) : []

    // Fetch all friend profile names
    let friends = []
    if (friendIds.length > 0) {
      const { data: friendProfiles, error: profilesError } = await db
        .from('profiles')
        .select('id, name')
        .in('id', friendIds)

      if (profilesError) throw profilesError
      friends = friendProfiles || []
    }

    displayProfile(profile, friends)

  } catch (err) {
    setStatus(`Error selecting profile: ${err.message}`, true)
  }
}

/**
 * addProfile()
 * Reads the name input, validates it is non-empty, inserts a new row
 * into profiles, reloads the list, and selects the new profile.
 * Handles the Postgres unique violation error (code 23505) separately
 * to provide a specific message instead of a generic database error.
 */
async function addProfile() {
  const nameInput = document.getElementById('input-name')
  const name      = nameInput.value.trim()

  if (!name) {
    setStatus('Error: Name field is empty. Please enter a name.', true)
    return
  }

  try {
    const { data, error } = await db
      .from('profiles')
      .insert({ name })
      .select()
      .single()

    if (error) {
      // Postgres error code 23505 = unique_violation
      if (error.code === '23505') {
        setStatus(`Error: A profile named "${name}" already exists.`, true)
      } else {
        throw error
      }
      return
    }

    nameInput.value = ''
    await loadProfileList()
    await selectProfile(data.id)
    setStatus(`Profile "${name}" created successfully.`)

  } catch (err) {
    setStatus(`Error adding profile: ${err.message}`, true)
  }
}

/**
 * lookUpProfile()
 * Performs a case-insensitive partial name search using Supabase's
 * ilike filter (equivalent to PostgreSQL ILIKE). Returns the first
 * match and selects it in the centre panel.
 */
async function lookUpProfile() {
  const query = document.getElementById('input-name').value.trim()

  if (!query) {
    setStatus('Error: Search field is empty. Please enter a name to search.', true)
    return
  }

  try {
    const { data, error } = await db
      .from('profiles')
      .select('id, name')
      .ilike('name', `%${query}%`)  // % wildcard = partial match
      .order('name', { ascending: true })
      .limit(1)

    if (error) throw error

    if (data.length === 0) {
      setStatus(`No profile found matching "${query}".`, true)
      clearCentrePanel()
      return
    }

    await selectProfile(data[0].id)

  } catch (err) {
    setStatus(`Error looking up profile: ${err.message}`, true)
  }
}

/**
 * deleteProfile()
 * Deletes the currently selected profile from Supabase.
 * The ON DELETE CASCADE constraint on the friends table
 * automatically removes all friend rows referencing this profile.
 */
async function deleteProfile() {
  if (!currentProfileId) {
    setStatus('Error: No profile is selected. Click a profile in the list first.', true)
    return
  }

  const name = document.getElementById('profile-name').textContent

  // Optional: confirm before deleting
  if (!window.confirm(`Delete the profile for "${name}"? This cannot be undone.`)) {
    setStatus('Deletion cancelled.')
    return
  }

  try {
    const { error } = await db
      .from('profiles')
      .delete()
      .eq('id', currentProfileId)

    if (error) throw error

    clearCentrePanel()
    await loadProfileList()
    setStatus(`Profile "${name}" deleted. Friend relationships removed automatically.`)

  } catch (err) {
    setStatus(`Error deleting profile: ${err.message}`, true)
  }
}

/**
 * changeStatus()
 * Updates the status column for the current profile in Supabase
 * and immediately reflects the change in the badge on the centre panel.
 */
async function changeStatus() {
  if (!currentProfileId) {
    setStatus('Error: No profile is selected.', true)
    return
  }
  const newStatus = document.getElementById('input-status').value.trim()
  if (!newStatus) {
    setStatus('Error: Status field is empty.', true)
    return
  }
  try {
    const { error } = await db
      .from('profiles')
      .update({ status: newStatus })
      .eq('id', currentProfileId)

    if (error) throw error

    document.getElementById('profile-status').textContent = newStatus
    document.getElementById('input-status').value = ''
    setStatus('Status updated.')

  } catch (err) {
    setStatus(`Error updating status: ${err.message}`, true)
  }
}

/**
 * updatePicture()
 * Router function that calls either uploadPictureFromFile or updatePictureFromURL
 * depending on which input field has data.
 */
async function updatePicture() {
  const fileInput = document.getElementById('file-picture')
  const urlInput = document.getElementById('input-picture-url')
  
  if (fileInput.files.length > 0) {
    await uploadPictureFromFile()
  } else if (urlInput.value.trim() !== '') {
    await updatePictureFromURL()
  } else {
    setStatus('Error: Please select a file or enter an image URL.', true)
  }
}

/**
 * uploadPictureFromFile()
 * Handles file upload from device. Converts PNG/JPG/JPEG to WebP,
 * uploads to Vercel Blob via the API, and updates Supabase with filename.
 */
async function uploadPictureFromFile() {
  if (!currentProfileId) {
    setStatus('Error: No profile is selected.', true)
    return
  }
  
  const fileInput = document.getElementById('file-picture')
  const file = fileInput.files[0]
  
  if (!file) {
    setStatus('Error: No file selected.', true)
    return
  }
  
  // Validate file type
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
  if (!allowedTypes.includes(file.type)) {
    setStatus('Error: Only JPG, PNG, and WebP files are allowed.', true)
    return
  }
  
  try {
    setStatus('Uploading image...')
    
    // Create FormData for multipart upload
    const formData = new FormData()
    formData.append('file', file)
    
    // Get filename without extension
    const filename = file.name.split('.')[0]
    formData.append('filename', filename)
    
    // Upload to API endpoint
    const response = await fetch('/api/upload-avatar', {
      method: 'POST',
      body: formData
    })
    
    if (!response.ok) {
      throw new Error(`Upload failed: ${response.statusText}`)
    }
    
    const result = await response.json()
    
    // Update Supabase with just the filename (convert to webp extension)
    const webpFilename = result.filename // API already returns .webp
    
    const { error } = await db
      .from('profiles')
      .update({ picture: webpFilename })
      .eq('id', currentProfileId)
    
    if (error) throw error
    
    // Update display
    const displayUrl = `${BLOB_BASE_URL}/avatars/${webpFilename}`
    document.getElementById('profile-pic').src = displayUrl
    fileInput.value = ''
    document.getElementById('input-picture-url').disabled = false
    setStatus(`Picture uploaded and saved successfully.`)
    
    // Reload profile list to show updated image
    await loadProfileList()
    
  } catch (err) {
    setStatus(`Error uploading picture: ${err.message}`, true)
  }
}

/**
 * updatePictureFromURL()
 * Updates the profile picture from a pasted image URL.
 * Validates that it's a WebP image from a trusted source.
 */
async function updatePictureFromURL() {
  if (!currentProfileId) {
    setStatus('Error: No profile is selected.', true)
    return
  }
  
  const urlInput = document.getElementById('input-picture-url')
  const imageUrl = urlInput.value.trim()
  
  if (!imageUrl) {
    setStatus('Error: URL field is empty.', true)
    return
  }
  
  // Validate URL format
  try {
    new URL(imageUrl)
  } catch {
    setStatus('Error: Invalid URL format.', true)
    return
  }
  
  // Validate it's a WebP image
  if (!imageUrl.toLowerCase().endsWith('.webp')) {
    setStatus('Error: Only WebP images are allowed from URLs. Convert your image to WebP first.', true)
    return
  }
  
  try {
    setStatus('Loading image...')
    
    // Verify the URL is accessible and is an image
    const response = await fetch(imageUrl, { method: 'HEAD' })
    if (!response.ok) {
      throw new Error('Image URL is not accessible')
    }
    
    const contentType = response.headers.get('content-type')
    if (!contentType || !contentType.includes('image')) {
      throw new Error('URL does not point to an image')
    }
    
    // Extract filename from URL
    const urlPath = new URL(imageUrl).pathname
    const filename = urlPath.split('/').pop().split('?')[0] // Remove query params
    
    // Update Supabase with the filename only
    const { error } = await db
      .from('profiles')
      .update({ picture: filename })
      .eq('id', currentProfileId)
    
    if (error) throw error
    
    // Update display
    document.getElementById('profile-pic').src = imageUrl
    urlInput.value = ''
    document.getElementById('file-picture').disabled = false
    setStatus('Picture updated from URL.')
    
    // Reload profile list to show updated image
    await loadProfileList()
    
  } catch (err) {
    setStatus(`Error updating picture: ${err.message}`, true)
  }
}

/**
 * changeQuote()
 * Updates the quote column for the current profile in Supabase
 * and immediately reflects the change in the centre panel.
 */
async function changeQuote() {
  if (!currentProfileId) {
    setStatus('Error: No profile is selected.', true)
    return
  }
  const newQuote = document.getElementById('input-quote').value.trim()
  if (!newQuote) {
    setStatus('Error: Quote field is empty.', true)
    return
  }
  try {
    const { error } = await db
      .from('profiles')
      .update({ quote: newQuote })
      .eq('id', currentProfileId)

    if (error) throw error

    document.getElementById('profile-quote').textContent = newQuote
    document.getElementById('input-quote').value = ''
    setStatus('Quote updated.')

  } catch (err) {
    setStatus(`Error updating quote: ${err.message}`, true)
  }
}

// ================================================================
// Section 5: Friends Management
// ================================================================

/**
 * addFriend()
 * Looks up the friend's profile by name, validates the relationship,
 * and inserts a new row in the friends table.
 */
async function addFriend() {
  if (!currentProfileId) {
    setStatus('Error: No profile is selected.', true)
    return
  }
  const friendName = document.getElementById('input-friend').value.trim()
  if (!friendName) {
    setStatus('Error: Friend name field is empty.', true)
    return
  }
  try {
    // Step 1: Resolve the friend's name to a UUID
    const { data: found, error: findError } = await db
      .from('profiles')
      .select('id, name')
      .ilike('name', friendName)
      .limit(1)

    if (findError) throw findError

    if (found.length === 0) {
      setStatus(`Error: No profile named "${friendName}" exists. Add that profile first.`, true)
      return
    }

    const friendId = found[0].id

    // Step 2: Prevent self-friendship
    if (friendId === currentProfileId) {
      setStatus('Error: A profile cannot be friends with itself.', true)
      return
    }

    // Step 3: Insert the friendship row
    const { error: insertError } = await db
      .from('friends')
      .insert({ profile_id: currentProfileId, friend_id: friendId })

    if (insertError) {
      if (insertError.code === '23505') {
        setStatus(`"${friendName}" is already in the friends list.`, true)
      } else {
        throw insertError
      }
      return
    }

    document.getElementById('input-friend').value = ''
    await selectProfile(currentProfileId)  // re-render to show new friend
    setStatus(`"${found[0].name}" added as a friend.`)

  } catch (err) {
    setStatus(`Error adding friend: ${err.message}`, true)
  }
}

/**
 * removeFriend()
 * Looks up the friend's profile by name and deletes the friendship row.
 * The bidirectional canonical row is deleted. Both profiles stop seeing each other.
 * The reverse edge (if it exists) is left intact.
 */
async function removeFriend() {
  if (!currentProfileId) {
    setStatus('Error: No profile is selected.', true)
    return
  }
  const friendName = document.getElementById('input-friend').value.trim()
  if (!friendName) {
    setStatus('Error: Friend name field is empty.', true)
    return
  }
  try {
    // Resolve the name to a UUID
    const { data: found, error: findError } = await db
      .from('profiles')
      .select('id, name')
      .ilike('name', friendName)
      .limit(1)

    if (findError) throw findError

    if (found.length === 0) {
      setStatus(`Error: No profile named "${friendName}" exists.`, true)
      return
    }

    const friendId = found[0].id

    // Delete only the row where profile_id = current AND friend_id = friend
    const { error: deleteError } = await db
      .from('friends')
      .delete()
      .eq('profile_id', currentProfileId)
      .eq('friend_id',  friendId)

    if (deleteError) throw deleteError

    document.getElementById('input-friend').value = ''
    await selectProfile(currentProfileId)  // re-render to reflect removal
    setStatus(`"${found[0].name}" removed from friends list.`)

  } catch (err) {
    setStatus(`Error removing friend: ${err.message}`, true)
  }
}

// ================================================================
// Section 6: Event Listener Setup
// ================================================================

document.addEventListener('DOMContentLoaded', async () => {

  // ── Left panel buttons ─────────────────────────────────────────
  document.getElementById('btn-add')
    .addEventListener('click', addProfile)
  document.getElementById('btn-lookup')
    .addEventListener('click', lookUpProfile)
  document.getElementById('btn-delete')
    .addEventListener('click', deleteProfile)

  // ── Right panel buttons ────────────────────────────────────────
  document.getElementById('btn-status')
    .addEventListener('click', changeStatus)
  document.getElementById('btn-update-picture')
    .addEventListener('click', updatePicture)
  document.getElementById('btn-add-friend')
    .addEventListener('click', addFriend)
  document.getElementById('btn-remove-friend')
    .addEventListener('click', removeFriend)
    
  // ── Picture upload mutual exclusivity ──────────────────────────
  const filePicture = document.getElementById('file-picture')
  const urlPicture = document.getElementById('input-picture-url')
  
  filePicture.addEventListener('change', () => {
    urlPicture.disabled = filePicture.files.length > 0
  })
  
  urlPicture.addEventListener('input', () => {
    filePicture.disabled = urlPicture.value.trim().length > 0
  })

  // ── Exit button ──────────────────────────────────────────────────
  document.getElementById('btn-exit')
    .addEventListener('click', () => {
      if (!window.close()) setStatus('To exit, close this browser tab.')
    })

  // ── Right panel: quote ───────────────────────────────────────────
  document.getElementById('btn-quote')
    .addEventListener('click', changeQuote)
  document.getElementById('input-quote')
    .addEventListener('keydown', e => { if (e.key === 'Enter') changeQuote() })
  
  // ── Right panel: picture URL ─────────────────────────────────────
  document.getElementById('input-picture-url')
    .addEventListener('keydown', e => { if (e.key === 'Enter') updatePicture() })

  // ── Enter key shortcuts ────────────────────────────────────────
  // Pressing Enter in the name field triggers Add Profile
  document.getElementById('input-name')
    .addEventListener('keydown', e => { if (e.key === 'Enter') addProfile() })

  // Pressing Enter in the status field triggers Change Status
  document.getElementById('input-status')
    .addEventListener('keydown', e => { if (e.key === 'Enter') changeStatus() })

  // Pressing Enter in the friend field triggers Add Friend
  document.getElementById('input-friend')
    .addEventListener('keydown', e => { if (e.key === 'Enter') addFriend() })

  // ── Initial data load ──────────────────────────────────────────
  await loadProfileList()
  setStatus('Ready. Select a profile from the list or add a new one.')

})