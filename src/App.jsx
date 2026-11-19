import { useState, useEffect } from 'react';
import './App.css';
import FriendsPanel from './FriendsPanel';
import MessagesPanel from './MessagesPanel';
import SafetyActions from './SafetyActions';

import { auth, db } from './firebase';
import { uploadToCloudinary } from './cloudinary';

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  onAuthStateChanged,
  signOut
} from 'firebase/auth';

import {
  doc,
  setDoc,
  getDoc,
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  deleteDoc,
  serverTimestamp
} from 'firebase/firestore';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [country, setCountry] = useState('Nigeria');

  const [error, setError] = useState('');
  const [passwordResetMessage, setPasswordResetMessage] = useState('');

  const [profile, setProfile] = useState({
    fullName: '',
    username: '',
    country: 'Nigeria',
    bio: '',
    photoURL: '',
    coverPhotoURL: ''
  });
  const [savedProfile, setSavedProfile] = useState(null);
  const [profilePhotoFile, setProfilePhotoFile] = useState(null);
  const [profilePhotoPreview, setProfilePhotoPreview] = useState('');
  const [coverPhotoFile, setCoverPhotoFile] = useState(null);
  const [coverPhotoPreview, setCoverPhotoPreview] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  const [profileLoading, setProfileLoading] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showFriends, setShowFriends] = useState(false);
  const [showMessages, setShowMessages] = useState(false);
  const [profileMessage, setProfileMessage] = useState('');
  const [profileError, setProfileError] = useState('');

  // POST STATES
  const [post, setPost] = useState('');
  const [posts, setPosts] = useState([]);
  const [blockedUserIds, setBlockedUserIds] = useState([]);
  const [postLikes, setPostLikes] = useState({});
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedError, setFeedError] = useState('');
  const [postError, setPostError] = useState('');

  // PHOTO AND VIDEO STATES
  const [mediaFile, setMediaFile] = useState(null);
  const [mediaPreview, setMediaPreview] = useState('');
  const [uploading, setUploading] = useState(false);

  // COMMENT STATES
  const [commentsByPost, setCommentsByPost] = useState({});
  const [commentInputs, setCommentInputs] = useState({});
  const [commentErrors, setCommentErrors] = useState({});

  // AUTHENTICATION
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // LOAD PROFILE
  useEffect(() => {
    async function loadProfile() {
      if (!user) return;

      setProfileLoading(true);
      setProfileError('');

      try {
        const profileRef = doc(db, 'users', user.uid);
        const snapshot = await getDoc(profileRef);

        let loadedProfile;
        if (snapshot.exists()) {
          const data = snapshot.data();
          loadedProfile = {
            fullName: data.fullName || '',
            username: data.username || '',
            country: data.country || 'Nigeria',
            bio: data.bio || '',
            photoURL: data.photoURL || '',
            coverPhotoURL: data.coverPhotoURL || ''
          };
        } else {
          loadedProfile = {
            fullName: user.displayName || '',
            username: 'user_' + user.uid.slice(0, 8),
            country: 'Nigeria',
            bio: '',
            photoURL: '',
            coverPhotoURL: ''
          };
        }

        setProfile(loadedProfile);
        setSavedProfile(loadedProfile);

        // Publish only non-private profile fields to the searchable directory.
        // A failure here must not prevent the member from using their account.
        try {
          await setDoc(doc(db, 'publicProfiles', user.uid), {
            uid: user.uid,
            ...loadedProfile,
            updatedAt: serverTimestamp()
          }, { merge: true });
        } catch (directoryError) {
          console.warn('Could not update public profile directory:', directoryError);
        }
      } catch (err) {
        console.error(err);
        setProfileError('Unable to load your profile.');
      } finally {
        setProfileLoading(false);
      }
    }

    loadProfile();
  }, [user]);

  // LOAD THE CURRENT MEMBER'S BLOCK LIST
  useEffect(() => {
    if (!user) {
      setBlockedUserIds([]);
      return undefined;
    }
    return onSnapshot(collection(db, 'users', user.uid, 'blocked'), (snapshot) => {
      setBlockedUserIds(snapshot.docs.map((item) => item.id));
    }, (err) => console.error('Block list error:', err));
  }, [user]);

  // LOAD NEWS FEED
  useEffect(() => {
    if (!user) return;

    setFeedLoading(true);
    setFeedError('');

    const postsQuery = query(
      collection(db, 'posts'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(
      postsQuery,
      (snapshot) => {
        const loadedPosts = snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data()
        }));

        setPosts(loadedPosts);
        setFeedLoading(false);
      },
      (err) => {
        console.error('Feed error:', err);
        setFeedError('Unable to load posts. Please check your connection.');
        setFeedLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  // LOAD LIKES
  useEffect(() => {
    if (!user) return;

    const unsubscribers = posts.map((item) => {
      const likesRef = collection(db, 'posts', item.id, 'likes');

      return onSnapshot(
        likesRef,
        (snapshot) => {
          setPostLikes((previous) => ({
            ...previous,
            [item.id]: {
              count: snapshot.size,
              likedByMe: snapshot.docs.some(
                (like) => like.id === user.uid
              )
            }
          }));
        },
        (err) => console.error('Likes error:', err)
      );
    });

    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [posts, user]);

  // LOAD COMMENTS
  useEffect(() => {
    if (!user) return;

    const unsubscribers = posts.map((item) => {
      const commentsQuery = query(
        collection(db, 'posts', item.id, 'comments'),
        orderBy('createdAt', 'asc')
      );

      return onSnapshot(
        commentsQuery,
        (snapshot) => {
          const loadedComments = snapshot.docs.map((comment) => ({
            id: comment.id,
            ...comment.data()
          }));

          setCommentsByPost((previous) => ({
            ...previous,
            [item.id]: loadedComments
          }));
        },
        (err) => {
          console.error('Comments error:', err);
          setCommentErrors((previous) => ({
            ...previous,
            [item.id]: 'Unable to load comments.'
          }));
        }
      );
    });

    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [posts, user]);

  // SELECT PHOTO OR VIDEO
  function handleMediaChange(event) {
    const file = event.target.files?.[0];

    if (!file) return;

    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');

    if (!isImage && !isVideo) {
      setPostError('Please select an image or video.');
      event.target.value = '';
      return;
    }

    const maxSize = isImage
      ? 5 * 1024 * 1024
      : 50 * 1024 * 1024;

    if (file.size > maxSize) {
      setPostError(
        isImage
          ? 'Image must be 5MB or smaller.'
          : 'Video must be 50MB or smaller.'
      );

      event.target.value = '';
      return;
    }

    setPostError('');
    setMediaFile(file);

    const previewURL = URL.createObjectURL(file);
    setMediaPreview(previewURL);
  }

  // REMOVE SELECTED MEDIA
  function removeMedia() {
    if (mediaPreview) {
      URL.revokeObjectURL(mediaPreview);
    }

    setMediaFile(null);
    setMediaPreview('');

    const input = document.getElementById('post-media-input');

    if (input) input.value = '';
  }

  // SEND A PASSWORD RESET LINK
  async function handlePasswordReset() {
    setError('');
    setPasswordResetMessage('');

    if (!email.trim()) {
      setError('Enter your account email address first.');
      return;
    }

    try {
      await sendPasswordResetEmail(auth, email.trim());
      setPasswordResetMessage('Password reset link sent. Check your email inbox and spam folder.');
    } catch (err) {
      console.error(err);
      if (err.code === 'auth/invalid-email') {
        setError('Please enter a valid email address.');
      } else if (err.code === 'auth/user-not-found') {
        setError('No FACEBOOM account was found with that email address.');
      } else {
        setError('Could not send the reset email. Please check your connection and try again.');
      }
    }
  }

  // REGISTER OR LOG IN
  async function handleAuth(event) {
    event.preventDefault();
    setError('');

    try {
      if (!email.trim() || !password) {
        setError('Please enter your email and password.');
        return;
      }

      if (registering) {
        if (!fullName.trim() || !country.trim()) {
          setError('Please enter your full name and country.');
          return;
        }

        if (password.length < 6) {
          setError('Password must contain at least 6 characters.');
          return;
        }

        const result = await createUserWithEmailAndPassword(
          auth,
          email.trim(),
          password
        );

        const username = fullName
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '');

        const newProfile = {
          fullName: fullName.trim(),
          username: username || ('user_' + result.user.uid.slice(0, 8)),
          country: country.trim(),
          bio: '',
          photoURL: '',
          coverPhotoURL: ''
        };

        await setDoc(doc(db, 'users', result.user.uid), {
          ...newProfile,
          email: email.trim(),
          accountStatus: 'active',
          createdAt: new Date().toISOString()
        });

        try {
          await setDoc(doc(db, 'publicProfiles', result.user.uid), {
            uid: result.user.uid,
            ...newProfile,
            updatedAt: serverTimestamp()
          });
        } catch (directoryError) {
          console.warn('Could not create public profile directory entry:', directoryError);
        }

      } else {
        await signInWithEmailAndPassword(
          auth,
          email.trim(),
          password
        );
      }

    } catch (err) {
      console.error(err);

      if (err.code === 'auth/email-already-in-use') {
        setError('This email is already registered. Please log in.');
      } else if (err.code === 'auth/invalid-credential') {
        setError('Incorrect email or password.');
      } else if (err.code === 'auth/weak-password') {
        setError('Password must contain at least 6 characters.');
      } else if (err.code === 'auth/invalid-email') {
        setError('Please enter a valid email address.');
      } else {
        setError(err.message);
      }
    }
  }

  // LOG OUT
  async function handleLogout() {
    try {
      await signOut(auth);
      setShowProfile(false);
      setShowFriends(false);
      setShowMessages(false);
      setEditingProfile(false);
    } catch (err) {
      console.error(err);
    }
  }

  // CREATE POST WITH OPTIONAL PHOTO OR VIDEO
  async function createPost() {
    if (!post.trim() && !mediaFile) {
      setPostError('Write something or select a photo/video.');
      return;
    }

    setPostError('');
    setUploading(true);

    try {
      let uploadedMedia = null;

      if (mediaFile) {
        uploadedMedia = await uploadToCloudinary(mediaFile);
      }

      const newPost = {
        authorId: user.uid,
        authorName: profile.fullName || user.email,
        authorUsername: profile.username || '',
        text: post.trim(),
        createdAt: serverTimestamp()
      };

      if (uploadedMedia) {
        newPost.mediaUrl = uploadedMedia.url;
        newPost.mediaType = uploadedMedia.type;
        newPost.mediaPublicId = uploadedMedia.publicId;
      }

      await addDoc(collection(db, 'posts'), newPost);

      setPost('');
      removeMedia();

    } catch (err) {
      console.error('Post upload error:', err);
      setPostError(err.message || 'Unable to publish your post.');
    } finally {
      setUploading(false);
    }
  }

  // LIKE OR UNLIKE A POST
  async function likePost(postId) {
    try {
      const likeRef = doc(
        db,
        'posts',
        postId,
        'likes',
        user.uid
      );

      const existingLike = await getDoc(likeRef);

      if (existingLike.exists()) {
        await deleteDoc(likeRef);
      } else {
        await setDoc(likeRef, {
          userId: user.uid,
          createdAt: serverTimestamp()
        });
      }

    } catch (err) {
      console.error('Like error:', err);
      setFeedError('Unable to update your like. Please try again.');
    }
  }

  // ADD COMMENT
  async function addComment(postId) {
    const commentText = (commentInputs[postId] || '').trim();

    if (!commentText) {
      setCommentErrors((previous) => ({
        ...previous,
        [postId]: 'Please write a comment first.'
      }));
      return;
    }

    if (commentText.length > 2000) {
      setCommentErrors((previous) => ({
        ...previous,
        [postId]: 'Your comment cannot exceed 2,000 characters.'
      }));
      return;
    }

    setCommentErrors((previous) => ({
      ...previous,
      [postId]: ''
    }));

    try {
      await addDoc(
        collection(db, 'posts', postId, 'comments'),
        {
          authorId: user.uid,
          authorName: profile.fullName || user.email,
          authorUsername: profile.username || '',
          text: commentText,
          createdAt: serverTimestamp()
        }
      );

      setCommentInputs((previous) => ({
        ...previous,
        [postId]: ''
      }));

    } catch (err) {
      console.error('Comment error:', err);

      setCommentErrors((previous) => ({
        ...previous,
        [postId]: 'Unable to publish your comment. Please try again.'
      }));
    }
  }

  // DELETE YOUR OWN COMMENT
  async function deleteComment(postId, commentId) {
    const confirmed = window.confirm(
      'Are you sure you want to delete this comment?'
    );

    if (!confirmed) return;

    try {
      await deleteDoc(
        doc(db, 'posts', postId, 'comments', commentId)
      );
    } catch (err) {
      console.error('Delete comment error:', err);

      setCommentErrors((previous) => ({
        ...previous,
        [postId]: 'Unable to delete this comment.'
      }));
    }
  }

  // DELETE YOUR OWN POST
  async function deletePost(postId) {
    const confirmed = window.confirm(
      'Are you sure you want to delete this post?'
    );

    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, 'posts', postId));
    } catch (err) {
      console.error(err);
      setFeedError('Unable to delete this post.');
    }
  }

  // SELECT PROFILE OR COVER IMAGE
  function handleProfileImageChange(event, imageType) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setProfileError('Please choose an image file.');
      event.target.value = '';
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setProfileError('Profile and cover images must be 5MB or smaller.');
      event.target.value = '';
      return;
    }

    setProfileError('');
    const preview = URL.createObjectURL(file);

    if (imageType === 'profile') {
      if (profilePhotoPreview) URL.revokeObjectURL(profilePhotoPreview);
      setProfilePhotoFile(file);
      setProfilePhotoPreview(preview);
    } else {
      if (coverPhotoPreview) URL.revokeObjectURL(coverPhotoPreview);
      setCoverPhotoFile(file);
      setCoverPhotoPreview(preview);
    }
  }

  function clearProfileImageSelections() {
    if (profilePhotoPreview) URL.revokeObjectURL(profilePhotoPreview);
    if (coverPhotoPreview) URL.revokeObjectURL(coverPhotoPreview);
    setProfilePhotoFile(null);
    setProfilePhotoPreview('');
    setCoverPhotoFile(null);
    setCoverPhotoPreview('');
  }

  function cancelProfileEdit() {
    if (savedProfile) setProfile(savedProfile);
    clearProfileImageSelections();
    setProfileError('');
    setEditingProfile(false);
  }

  // SAVE PROFILE
  async function saveProfile(event) {
    event.preventDefault();

    setProfileMessage('');
    setProfileError('');

    if (
      !profile.fullName.trim() ||
      !profile.username.trim() ||
      !profile.country.trim()
    ) {
      setProfileError('Please complete your name, username and country.');
      return;
    }

    const cleanedUsername = profile.username
      .trim()
      .toLowerCase()
      .replace(/^@/, '')
      .replace(/[^a-z0-9_]/g, '');

    if (!cleanedUsername) {
      setProfileError('Please enter a valid username.');
      return;
    }

    setSavingProfile(true);

    try {
      let photoURL = profile.photoURL || '';
      let coverPhotoURL = profile.coverPhotoURL || '';

      if (profilePhotoFile) {
        const uploadedPhoto = await uploadToCloudinary(profilePhotoFile);
        photoURL = uploadedPhoto.url;
      }

      if (coverPhotoFile) {
        const uploadedCover = await uploadToCloudinary(coverPhotoFile);
        coverPhotoURL = uploadedCover.url;
      }

      const updatedProfile = {
        fullName: profile.fullName.trim(),
        username: cleanedUsername,
        country: profile.country.trim(),
        bio: profile.bio.trim(),
        photoURL,
        coverPhotoURL,
        email: user.email,
        updatedAt: new Date().toISOString()
      };

      await setDoc(
        doc(db, 'users', user.uid),
        updatedProfile,
        { merge: true }
      );

      try {
        await setDoc(doc(db, 'publicProfiles', user.uid), {
          uid: user.uid,
          fullName: updatedProfile.fullName,
          username: updatedProfile.username,
          country: updatedProfile.country,
          bio: updatedProfile.bio,
          photoURL: updatedProfile.photoURL,
          coverPhotoURL: updatedProfile.coverPhotoURL,
          updatedAt: serverTimestamp()
        }, { merge: true });
      } catch (directoryError) {
        console.warn('Could not update public profile directory:', directoryError);
      }

      setProfile(updatedProfile);
      setSavedProfile(updatedProfile);
      clearProfileImageSelections();
      setEditingProfile(false);
      setProfileMessage('Your profile has been saved successfully.');

    } catch (err) {
      console.error('Profile save error:', err);
      setProfileError(err.message || 'Unable to save your profile. Please try again.');
    } finally {
      setSavingProfile(false);
    }
  }

  // FORMAT DATE
  function formatDate(timestamp) {
    if (!timestamp) return 'Just now';

    const date = timestamp.toDate
      ? timestamp.toDate()
      : new Date(timestamp);

    return date.toLocaleString();
  }

  // LOADING SCREEN
  if (loading) {
    return (
      <div style={centerStyle}>
        <h2>FACEBOOM</h2>
        <p>Loading...</p>
      </div>
    );
  }

  // LOGIN AND REGISTRATION
  if (!user) {
    return (
      <div style={authPageStyle}>
        <div style={authCardStyle}>
          <h1 style={{ color: '#1877f2' }}>FACEBOOM</h1>

          <p>Connect with friends and the world around you.</p>

          <h2>{registering ? 'Create Your Account' : 'Welcome Back'}</h2>

          <form onSubmit={handleAuth}>
            {registering && (
              <>
                <input
                  style={inputStyle}
                  type="text"
                  placeholder="Full Name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />

                <input
                  style={inputStyle}
                  type="text"
                  placeholder="Country"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                />
              </>
            )}

            <input
              style={inputStyle}
              type="email"
              placeholder="Email Address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            <input
              style={inputStyle}
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            {!registering && (
              <button
                type="button"
                style={{ ...switchButtonStyle, display: 'block', margin: '0 0 12px auto' }}
                onClick={handlePasswordReset}
              >
                Forgot Password?
              </button>
            )}

            {passwordResetMessage && (
              <p style={{ color: 'green', marginBottom: 10 }}>{passwordResetMessage}</p>
            )}

            {error && <p style={errorStyle}>{error}</p>}

            <button type="submit" style={primaryButtonStyle}>
              {registering ? 'Sign Up' : 'Log In'}
            </button>
          </form>

          <p style={{ marginTop: 20 }}>
            {registering
              ? 'Already have an account?'
              : "Don't have an account?"}

            <button
              style={switchButtonStyle}
              onClick={() => {
                setRegistering(!registering);
                setError('');
              }}
            >
              {registering ? 'Log In' : 'Sign Up'}
            </button>
          </p>
        </div>
      </div>
    );
  }

  // MAIN HOMEPAGE
  return (
    <div style={homePageStyle}>

      <header style={headerStyle}>
        <h1 style={{ color: '#1877f2', margin: 0 }}>
          FACEBOOM
        </h1>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            style={headerButtonStyle}
            onClick={() => {
              setShowProfile(false);
              setShowFriends(false);
              setShowMessages(false);
              setEditingProfile(false);
            }}
          >
            Home
          </button>

          <button
            style={headerButtonStyle}
            onClick={() => {
              setShowProfile(true);
              setShowFriends(false);
              setShowMessages(false);
              setEditingProfile(false);
              setProfileMessage('');
              setProfileError('');
            }}
          >
            My Profile
          </button>

          <button
            style={headerButtonStyle}
            onClick={() => {
              setShowProfile(false);
              setShowMessages(false);
              setEditingProfile(false);
              setShowFriends(true);
            }}
          >
            Find Friends
          </button>

          <button
            style={headerButtonStyle}
            onClick={() => {
              setShowProfile(false);
              setShowFriends(false);
              setShowMessages(true);
              setEditingProfile(false);
            }}
          >
            Messages
          </button>

          <button
            style={logoutButtonStyle}
            onClick={handleLogout}
          >
            Log Out
          </button>
        </div>
      </header>

      <main style={mainStyle}>

        {showMessages ? (
          <MessagesPanel
            user={user}
            profile={profile}
            onBack={() => setShowMessages(false)}
          />
        ) : showFriends ? (
          <FriendsPanel
            user={user}
            profile={profile}
            onBack={() => setShowFriends(false)}
          />
        ) : showProfile ? (
          <div style={cardStyle}>
            <h2 style={{ color: '#1877f2' }}>My Profile</h2>

            {profileLoading ? (
              <p>Loading your profile...</p>
            ) : (
              <>
                <div
                  style={{
                    ...coverPhotoStyle,
                    backgroundImage: `url(${coverPhotoPreview || profile.coverPhotoURL || ''})`
                  }}
                >
                  {!coverPhotoPreview && !profile.coverPhotoURL && (
                    <span style={coverPlaceholderStyle}>Your cover photo</span>
                  )}
                </div>

                {profilePhotoPreview || profile.photoURL ? (
                  <img
                    src={profilePhotoPreview || profile.photoURL}
                    alt="Profile"
                    style={profileImageStyle}
                  />
                ) : (
                  <div style={avatarStyle}>
                    {(profile.fullName || user.email || 'U')
                      .charAt(0)
                      .toUpperCase()}
                  </div>
                )}

                {editingProfile ? (
                  <form onSubmit={saveProfile}>
                    <label style={labelStyle}>Full Name</label>

                    <input
                      style={inputStyle}
                      value={profile.fullName}
                      onChange={(e) =>
                        setProfile({
                          ...profile,
                          fullName: e.target.value
                        })
                      }
                    />

                    <label style={labelStyle}>Username</label>

                    <input
                      style={inputStyle}
                      value={profile.username}
                      onChange={(e) =>
                        setProfile({
                          ...profile,
                          username: e.target.value
                        })
                      }
                    />

                    <label style={labelStyle}>Country</label>

                    <input
                      style={inputStyle}
                      value={profile.country}
                      onChange={(e) =>
                        setProfile({
                          ...profile,
                          country: e.target.value
                        })
                      }
                    />

                    <label style={labelStyle}>About Me</label>

                    <textarea
                      style={textareaStyle}
                      value={profile.bio}
                      onChange={(e) =>
                        setProfile({
                          ...profile,
                          bio: e.target.value
                        })
                      }
                      placeholder="Tell people about yourself..."
                    />

                    <label style={labelStyle}>Profile Picture</label>
                    <input
                      style={inputStyle}
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleProfileImageChange(e, 'profile')}
                    />
                    <small style={helperTextStyle}>Choose an image up to 5MB.</small>

                    <label style={labelStyle}>Cover Photo</label>
                    <input
                      style={inputStyle}
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleProfileImageChange(e, 'cover')}
                    />
                    <small style={helperTextStyle}>Choose an image up to 5MB.</small>

                    {profileError && (
                      <p style={errorStyle}>{profileError}</p>
                    )}

                    <button
                      type="submit"
                      style={{ ...primaryButtonStyle, opacity: savingProfile ? 0.65 : 1 }}
                      disabled={savingProfile}
                    >
                      {savingProfile ? 'Uploading and Saving...' : 'Save Profile'}
                    </button>

                    <button
                      type="button"
                      style={cancelButtonStyle}
                      onClick={cancelProfileEdit}
                      disabled={savingProfile}
                    >
                      Cancel
                    </button>
                  </form>
                ) : (
                  <>
                    <h2>{profile.fullName || 'Your Name'}</h2>

                    <p style={{ color: '#1877f2' }}>
                      @{profile.username || 'username'}
                    </p>

                    <p><strong>Country:</strong> {profile.country}</p>

                    <p><strong>Email:</strong> {user.email}</p>

                    <div style={bioStyle}>
                      <strong>About Me</strong>
                      <p>
                        {profile.bio || 'You have not added a biography yet.'}
                      </p>
                    </div>

                    <button
                      style={primaryButtonStyle}
                      onClick={() => {
                        setProfileMessage('');
                        setProfileError('');
                        setEditingProfile(true);
                      }}
                    >
                      Edit Profile
                    </button>
                  </>
                )}

                {profileMessage && (
                  <p style={successStyle}>{profileMessage}</p>
                )}
              </>
            )}
          </div>
        ) : (
          <>
            <div style={cardStyle}>
              <h2>Welcome to FACEBOOM!</h2>

              <p>Hello, {profile.fullName || user.email}</p>

              <p>Share your thoughts with the world.</p>
            </div>

            {/* CREATE POST */}
            <div style={cardStyle}>
              <h2>Create a Post</h2>

              <textarea
                style={textareaStyle}
                placeholder="What's on your mind?"
                value={post}
                onChange={(e) => setPost(e.target.value)}
              />

              {/* PHOTO AND VIDEO SELECTOR */}
              <div style={mediaSelectorStyle}>
                <label htmlFor="post-media-input" style={mediaLabelStyle}>
                  📷 Add Photo or Video
                </label>

                <input
                  id="post-media-input"
                  type="file"
                  accept="image/*,video/mp4,video/quicktime"
                  onChange={handleMediaChange}
                  style={{ display: 'none' }}
                />
              </div>

              {/* MEDIA PREVIEW */}
              {mediaPreview && (
                <div style={previewContainerStyle}>
                  {mediaFile?.type.startsWith('video/') ? (
                    <video
                      src={mediaPreview}
                      controls
                      style={previewMediaStyle}
                    />
                  ) : (
                    <img
                      src={mediaPreview}
                      alt="Selected preview"
                      style={previewMediaStyle}
                    />
                  )}

                  <button
                    type="button"
                    style={removeMediaButtonStyle}
                    onClick={removeMedia}
                  >
                    Remove Media
                  </button>
                </div>
              )}

              {postError && (
                <p style={errorStyle}>{postError}</p>
              )}

              <button
                style={{
                  ...primaryButtonStyle,
                  opacity: uploading ? 0.6 : 1
                }}
                onClick={createPost}
                disabled={uploading}
              >
                {uploading ? 'Uploading and Publishing...' : 'Publish Post'}
              </button>
            </div>

            {/* NEWS FEED */}
            <h2 style={{ color: '#1877f2' }}>News Feed</h2>

            {feedError && (
              <p style={errorStyle}>{feedError}</p>
            )}

            {feedLoading && <p>Loading posts...</p>}

            {!feedLoading && posts.length === 0 && (
              <div style={cardStyle}>
                <p>No posts yet. Be the first to publish!</p>
              </div>
            )}

            {posts.filter((item) => !blockedUserIds.includes(item.authorId)).map((item) => {
              const likes = postLikes[item.id] || {
                count: 0,
                likedByMe: false
              };

              const comments = commentsByPost[item.id] || [];

              return (
                <div key={item.id} style={cardStyle}>
                  <h3 style={{ marginBottom: 5 }}>
                    {item.authorName || 'FACEBOOM User'}
                  </h3>

                  {item.authorUsername && (
                    <p style={{ color: '#1877f2', marginTop: 0 }}>
                      @{item.authorUsername}
                    </p>
                  )}
                  <SafetyActions
                    user={user}
                    targetUid={item.authorId}
                    targetName={item.authorName}
                    contentType="post"
                    contentId={item.id}
                  />

                  <small style={{ color: '#777' }}>
                    {formatDate(item.createdAt)}
                  </small>

                  {item.text && (
                    <p style={postTextStyle}>
                      {item.text}
                    </p>
                  )}

                  {/* DISPLAY POST PHOTO OR VIDEO */}
                  {item.mediaUrl && (
                    <div style={postMediaContainerStyle}>
                      {item.mediaType === 'video' ? (
                        <video
                          src={item.mediaUrl}
                          controls
                          preload="metadata"
                          style={postMediaStyle}
                        >
                          Your browser does not support video playback.
                        </video>
                      ) : (
                        <img
                          src={item.mediaUrl}
                          alt="Post attachment"
                          loading="lazy"
                          style={postMediaStyle}
                        />
                      )}
                    </div>
                  )}

                  <hr style={dividerStyle} />

                  {/* LIKE BUTTON */}
                  <button
                    style={likeButtonStyle}
                    onClick={() => likePost(item.id)}
                  >
                    {likes.likedByMe ? '❤️ Liked' : '👍 Like'}
                  </button>

                  <span style={{ marginLeft: 10, color: '#666' }}>
                    {likes.count} Likes
                  </span>

                  {item.authorId === user.uid && (
                    <button
                      style={deleteButtonStyle}
                      onClick={() => deletePost(item.id)}
                    >
                      Delete Post
                    </button>
                  )}

                  {/* COMMENTS */}
                  <div style={commentsSectionStyle}>
                    <h3 style={{ marginTop: 0 }}>
                      Comments ({comments.length})
                    </h3>

                    {comments.length === 0 && (
                      <p style={{ color: '#777' }}>
                        No comments yet. Be the first to comment!
                      </p>
                    )}

                    {comments.map((comment) => (
                      <div key={comment.id} style={commentStyle}>
                        <strong>
                          {comment.authorName || 'FACEBOOM User'}
                        </strong>

                        {comment.authorUsername && (
                          <span style={commentUsernameStyle}>
                            @{comment.authorUsername}
                          </span>
                        )}

                        <p style={commentTextStyle}>
                          {comment.text}
                        </p>

                        <small style={{ color: '#888' }}>
                          {formatDate(comment.createdAt)}
                        </small>

                        {comment.authorId === user.uid && (
                          <button
                            style={deleteCommentButtonStyle}
                            onClick={() =>
                              deleteComment(item.id, comment.id)
                            }
                          >
                            Delete Comment
                          </button>
                        )}
                      </div>
                    ))}

                    {/* WRITE COMMENT */}
                    <textarea
                      style={commentInputStyle}
                      placeholder="Write a comment..."
                      value={commentInputs[item.id] || ''}
                      maxLength={2000}
                      onChange={(e) =>
                        setCommentInputs((previous) => ({
                          ...previous,
                          [item.id]: e.target.value
                        }))
                      }
                    />

                    <small style={{ color: '#777' }}>
                      {(commentInputs[item.id] || '').length}/2000 characters
                    </small>

                    {commentErrors[item.id] && (
                      <p style={errorStyle}>
                        {commentErrors[item.id]}
                      </p>
                    )}

                    <button
                      style={commentButtonStyle}
                      onClick={() => addComment(item.id)}
                    >
                      Post Comment
                    </button>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </main>
    </div>
  );
}

// STYLES

const centerStyle = {
  textAlign: 'center',
  padding: 50
};

const authPageStyle = {
  minHeight: '100vh',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  background: '#f0f2f5',
  padding: 20,
  boxSizing: 'border-box'
};

const authCardStyle = {
  background: '#fff',
  padding: 30,
  borderRadius: 12,
  width: '100%',
  maxWidth: 400,
  boxShadow: '0 2px 12px rgba(0,0,0,0.1)',
  textAlign: 'center',
  boxSizing: 'border-box'
};

const homePageStyle = {
  minHeight: '100vh',
  background: '#f0f2f5',
  fontFamily: 'Arial, sans-serif'
};

const headerStyle = {
  background: '#fff',
  padding: '15px 5%',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: 15,
  boxShadow: '0 2px 5px rgba(0,0,0,0.1)'
};

const mainStyle = {
  maxWidth: 650,
  margin: '25px auto',
  padding: '0 15px'
};

const cardStyle = {
  background: '#fff',
  padding: 20,
  borderRadius: 10,
  marginBottom: 20,
  boxShadow: '0 1px 5px rgba(0,0,0,0.08)',
  overflowWrap: 'break-word'
};

const inputStyle = {
  width: '100%',
  padding: 12,
  margin: '10px 0',
  border: '1px solid #ddd',
  borderRadius: 6,
  fontSize: 15,
  boxSizing: 'border-box'
};

const textareaStyle = {
  width: '100%',
  minHeight: 100,
  padding: 12,
  margin: '10px 0',
  border: '1px solid #ddd',
  borderRadius: 6,
  fontSize: 15,
  resize: 'vertical',
  boxSizing: 'border-box'
};

const primaryButtonStyle = {
  width: '100%',
  padding: 13,
  background: '#1877f2',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  fontSize: 16,
  cursor: 'pointer',
  marginTop: 10
};

const switchButtonStyle = {
  background: 'none',
  border: 'none',
  color: '#1877f2',
  cursor: 'pointer',
  fontWeight: 'bold',
  marginLeft: 5
};

const headerButtonStyle = {
  padding: '9px 14px',
  background: '#e7f3ff',
  color: '#1877f2',
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer'
};

const logoutButtonStyle = {
  padding: '9px 14px',
  background: '#e53935',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer'
};

const likeButtonStyle = {
  padding: '8px 14px',
  background: '#e7f3ff',
  color: '#1877f2',
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer'
};

const deleteButtonStyle = {
  padding: '8px 14px',
  background: '#ffebee',
  color: '#c62828',
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer',
  marginLeft: 10
};

const cancelButtonStyle = {
  width: '100%',
  padding: 12,
  background: '#777',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer',
  marginTop: 10
};

const profileImageStyle = {
  width: 120,
  height: 120,
  borderRadius: '50%',
  objectFit: 'cover',
  display: 'block',
  margin: '15px auto'
};

const coverPhotoStyle = {
  width: '100%',
  height: 190,
  borderRadius: 10,
  backgroundColor: '#dce6f1',
  backgroundSize: 'cover',
  backgroundPosition: 'center',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  margin: '12px 0 0'
};

const coverPlaceholderStyle = {
  color: '#52606d',
  fontWeight: 'bold'
};

const helperTextStyle = {
  display: 'block',
  color: '#687684',
  fontSize: 12,
  marginTop: -4,
  marginBottom: 8
};

const avatarStyle = {
  width: 120,
  height: 120,
  borderRadius: '50%',
  background: '#1877f2',
  color: '#fff',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  fontSize: 45,
  margin: '15px auto'
};

const labelStyle = {
  display: 'block',
  textAlign: 'left',
  fontWeight: 'bold',
  marginTop: 12
};

const bioStyle = {
  background: '#f7f8fa',
  padding: 15,
  borderRadius: 8,
  margin: '15px 0',
  textAlign: 'left'
};

const mediaSelectorStyle = {
  marginTop: 10,
  marginBottom: 10
};

const mediaLabelStyle = {
  display: 'inline-block',
  background: '#e7f3ff',
  color: '#1877f2',
  padding: '12px 16px',
  borderRadius: 7,
  cursor: 'pointer',
  fontWeight: 'bold'
};

const previewContainerStyle = {
  marginTop: 15,
  padding: 10,
  background: '#f7f8fa',
  borderRadius: 8
};

const previewMediaStyle = {
  width: '100%',
  maxHeight: 350,
  objectFit: 'contain',
  borderRadius: 8
};

const removeMediaButtonStyle = {
  display: 'block',
  marginTop: 10,
  padding: '8px 12px',



  
  background: '#ffebee',
  color: '#c62828',
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer'
};

const postMediaContainerStyle = {
  marginTop: 15,
  marginBottom: 15,
  width: '100%'
};

const postMediaStyle = {
  width: '100%',
  maxHeight: 500,
  objectFit: 'contain',
  borderRadius: 8,
  background: '#f0f2f5'
};

const postTextStyle = {
  lineHeight: 1.6,
  whiteSpace: 'pre-wrap',
  margin: '15px 0'
};

const commentsSectionStyle = {
  marginTop: 20,
  paddingTop: 15,
  borderTop: '1px solid #eee'
};

const commentStyle = {
  background: '#f7f8fa',
  padding: 12,
  borderRadius: 8,
  marginBottom: 10,
  overflowWrap: 'break-word'
};

const commentUsernameStyle = {
  color: '#1877f2',
  marginLeft: 8,
  fontSize: 13
};

const commentTextStyle = {
  margin: '8px 0',
  whiteSpace: 'pre-wrap',
  lineHeight: 1.5
};

const commentInputStyle = {
  width: '100%',
  minHeight: 70,
  padding: 12,
  marginTop: 15,
  border: '1px solid #ddd',
  borderRadius: 6,
  fontSize: 14,
  resize: 'vertical',
  boxSizing: 'border-box'
};

const commentButtonStyle = {
  padding: '10px 16px',
  background: '#1877f2',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer',
  marginTop: 10
};

const deleteCommentButtonStyle = {
  display: 'block',
  padding: '5px 10px',
  background: '#ffebee',
  color: '#c62828',
  border: 'none',
  borderRadius: 5,
  cursor: 'pointer',
  marginTop: 8,
  fontSize: 12
};

const dividerStyle = {
  border: 'none',
  borderTop: '1px solid #eee'
};

const errorStyle = {
  color: '#d93025',
  fontSize: 14
};

const successStyle = {
  color: '#188038',
  fontWeight: 'bold',
  marginTop: 15
};

export default App;