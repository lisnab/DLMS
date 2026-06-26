require('dotenv').config();

const dns = require('dns');

// Force Node.js to use Google DNS
dns.setServers(['8.8.8.8', '8.8.4.4']);

const mongoose = require('mongoose');
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3020;

// ======================
// MongoDB Connection
// ======================
async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10000
    });

    console.log("✅ Connected to MongoDB");
  } catch (err) {
    console.log("========== MONGODB ERROR ==========");
    console.error(err);
    console.log("===================================");

    setTimeout(connectDB, 5000);
  }
}


app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(cors());

// Ensure schema definitions are correct
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  fullname: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String, required: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['student', 'librarian'], default: 'student' }
});

const User = mongoose.model('User', userSchema);

const bookSchema = new mongoose.Schema({
  bookId: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  author: { type: String, required: true },
  isbn: { type: String, required: true },
  quantity: { type: Number, required: true },
  status: { type: String, default: 'Available' }
});

const Book = mongoose.model('Book', bookSchema);

const issuedBookSchema = new mongoose.Schema({
  bookId: { type: String, required: true },
  bookName: { type: String, required: true },
  studentId: { type: String, required: true },
  studentName: { type: String, required: true },
  section: { type: String, required: true },
  issueDate: { type: String, required: true },
  dueDate: { type: String, required: true },
  returnDate: { type: String }
});

const IssuedBook = mongoose.model('IssuedBook', issuedBookSchema);

const memberSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String, required: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['student', 'librarian'], default: 'student' }
});

const Member = mongoose.model('Member', memberSchema);

const fineSchema = new mongoose.Schema({
  amountCollected: { type: Number, default: 0 }
});

const Fine = mongoose.model('Fine', fineSchema);

const notificationSchema = new mongoose.Schema({
  message: { type: String, required: true },
  date: { type: Date, default: Date.now }
});

const Notification = mongoose.model('Notification', notificationSchema);

// Ensure routes are correctly handling requests
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/dashboard.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/user_dashboard.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'user_dashboard.html'));
});

app.get('/membermanagement.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'membermanagement.html'));
});

app.get('/report.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'report.html'));
});

// Login route
app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    console.log('Login attempt:', { username, password });

    const user = await User.findOne({ username });
    if (!user) {
      console.log('User not found:', username);
      return res.status(400).json({ error: 'Invalid username or password' });
    }

    console.log('User found:', user);

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      console.log('Password mismatch for user:', username);
      return res.status(400).json({ error: 'Invalid username or password' });
    }

    console.log('User logged in successfully:', username);
    const redirectUrl = user.role === 'librarian' ? '/dashboard.html' : '/user_dashboard.html';
    res.json({ role: user.role, redirectUrl, username: user.username });

  } catch (err) {
    console.error('Error logging in user:', err);
    res.status(500).json({ error: 'Error logging in user' });
  }
});

// Register route
app.post('/register', async (req, res) => {
  const { username, fullname, email, phone, password, confirmPassword } = req.body;

  console.log('Received data:', req.body);

  if (!username || !fullname || !email || !phone || !password || !confirmPassword) {
    return res.status(400).send('All fields are required');
  }

  if (password !== confirmPassword) {
    return res.status(400).send('Passwords do not match');
  }

  try {
    const existingUser = await User.findOne({ $or: [{ email }, { phone }] });
    if (existingUser) {
      if (existingUser.email === email) {
        return res.status(400).send('Email already exists');
      }
      if (existingUser.phone === phone) {
        return res.status(400).send('Phone number already exists');
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const role = email.endsWith('@sksu.edu.ph') ? 'student' : 'librarian';

    const user = new User({
      username,
      fullname,
      email,
      phone,
      password: hashedPassword,
      role
    });

    await user.save();
    console.log('User registered successfully:', username);
    await addNotification(`User ${username} registered successfully.`);
    res.redirect('/login.html');
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).send('Error registering user');
  }
});

// Add book route
app.post('/api/books', async (req, res) => {
  const { bookId, title, author, isbn, quantity } = req.body;

  // Check if the bookId already exists
  const existingBook = await Book.findOne({ bookId });
  if (existingBook) {
    return res.status(400).json({ message: 'Book ID already exists' });
  }

  const newBook = new Book({ bookId, title, author, isbn, quantity });
  try {
    await newBook.save();
    await addNotification(`Book ${title} added successfully.`);
    res.status(201).json(newBook);
  } catch (error) {
    res.status(500).json({ message: 'Failed to add book' });
  }
});

// Get books route
app.get('/api/books', async (req, res) => {
  const books = await Book.find();
  res.json(books);
});

// Delete book route
app.delete('/api/books/:bookId', async (req, res) => {
  try {
    const book = await Book.findOneAndDelete({ bookId: req.params.bookId });
    if (!book) {
      return res.status(404).json({ message: 'Book not found' });
    }
    await addNotification(`Book ${book.title} deleted successfully.`);
    res.json(book);
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete book' });
  }
});

// Update book route
app.put('/api/books/:bookId', async (req, res) => {
  try {
    const book = await Book.findOneAndUpdate({ bookId: req.params.bookId }, req.body, { new: true });
    if (!book) {
      return res.status(404).send('Book not found');
    }
    await addNotification(`Book ${book.title} updated successfully.`);
    res.send(book);
  } catch (err) {
    console.error('Error updating book:', err.message);
    res.status(500).send('Error updating book');
  }
});

// Issue book route
app.post('/issue-book', async (req, res) => {
  const { bookId, bookName, studentId, studentName, section, issueDate, dueDate } = req.body;

  console.log('Received issue data:', req.body);

  try {
    const book = await Book.findOne({ bookId });
    if (!book) {
      return res.status(404).json({ message: 'Book not found' });
    }

    if (book.quantity <= 0) {
      return res.status(400).json({ message: 'Book is not available' });
    }

    book.quantity -= 1;
    if (book.quantity === 0) {
      book.status = 'Unavailable';
    }
    await book.save();

    const issuedBook = new IssuedBook({
      bookId,
      bookName,
      studentId,
      studentName,
      section,
      issueDate,
      dueDate
    });

    await issuedBook.save();
    await addNotification(`Book ${bookName} issued to ${studentName}.`);
    console.log('Book issued successfully:', bookId);
    res.status(201).json(issuedBook);
  } catch (err) {
    console.error('Error issuing book:', err);
    res.status(500).json({ message: 'Error issuing book' });
  }
});

// Get issued books route
app.get('/api/issued-books', async (req, res) => {
  const issuedBooks = await IssuedBook.find({ returnDate: { $exists: false } });
  res.json(issuedBooks);
});

// Get issued books for a specific user route
app.get('/api/issued-books/:username', async (req, res) => {
  const { username } = req.params;
  const issuedBooks = await IssuedBook.find({ studentId: username });
  res.json(issuedBooks);
});

// Return book route
app.post('/return-book/:bookId', async (req, res) => {
  const { bookId } = req.params;
  const { returnDate } = req.body;

  try {
    const issuedBook = await IssuedBook.findOne({ bookId, returnDate: { $exists: false } });
    if (!issuedBook) {
      return res.status(404).json({ message: 'Issued book not found' });
    }

    issuedBook.returnDate = returnDate;
    await issuedBook.save();

    const book = await Book.findOne({ bookId });
    if (book) {
      book.quantity += 1;
      if (book.quantity > 0) {
        book.status = 'Available';
      }
      await book.save();
    }

    const dueDate = new Date(issuedBook.dueDate);
    const currentDate = new Date(returnDate);
    if (currentDate > dueDate) {
      const daysOverdue = Math.floor((currentDate - dueDate) / (1000 * 60 * 60 * 24));
      const fineAmount = daysOverdue * 25; // Assuming a fine of 25 PHP per day
      await addFineToAmountCollected(fineAmount);
    }

    await addNotification(`Book ${issuedBook.bookName} returned by ${issuedBook.studentName}.`);
    console.log('Book returned successfully:', bookId);
    res.status(200).json(issuedBook);
  } catch (err) {
    console.error('Error returning book:', err);
    res.status(500).json({ message: 'Error returning book' });
  }
});

// Get returned books route
app.get('/api/returned-books', async (req, res) => {
  const returnedBooks = await IssuedBook.find({ returnDate: { $exists: true } });
  res.json(returnedBooks);
});

// Delete returned book route
app.delete('/api/returned-books/:bookId', async (req, res) => {
  try {
    const book = await IssuedBook.findOneAndDelete({ bookId: req.params.bookId });
    if (!book) {
      return res.status(404).json({ message: 'Returned book not found' });
    }
    await addNotification(`Returned book ${book.bookName} deleted successfully.`);
    res.json(book);
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete returned book' });
  }
});

// Get members route
app.get('/api/members', async (req, res) => {
  const members = await User.find(); // Use User model to fetch registered users
  res.json(members);
});

// Get member by student ID route
app.get('/api/members/:studentId', async (req, res) => {
  try {
    const member = await User.findOne({ username: req.params.studentId });
    if (!member) {
      return res.status(404).json({ message: 'Student ID not found' });
    }
    res.json(member);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch member' });
  }
});

// Add member route
app.post('/api/members', async (req, res) => {
  const { username, fullname, email, phone, password, role } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const newMember = new User({ username, fullname, email, phone, password: hashedPassword, role }); // Use User model to add member
    await newMember.save();
    await addNotification(`Member ${fullname} added successfully.`);
    res.status(201).json(newMember);
  } catch (error) {
    res.status(500).json({ message: 'Failed to add member' });
  }
});

// Update member route
app.put('/api/members/:id', async (req, res) => {
  try {
    const member = await User.findByIdAndUpdate(req.params.id, req.body, { new: true }); // Use User model to update member
    if (!member) {
      return res.status(404).send('Member not found');
    }
    await addNotification(`Member ${member.fullname} updated successfully.`);
    res.send(member);
  } catch (err) {
    console.error('Error updating member:', err.message);
    res.status(500).send('Error updating member');
  }
});

// Delete member route
app.delete('/api/members/:id', async (req, res) => {
  try {
    const member = await User.findByIdAndDelete(req.params.id); // Use User model to delete member
    if (!member) {
      return res.status(404).json({ message: 'Member not found' });
    }
    await addNotification(`Member ${member.fullname} deleted successfully.`);
    res.json(member);
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete member' });
  }
});

// Add fine route
app.post('/api/add-fine', async (req, res) => {
  const { fineAmount } = req.body;

  try {
    let fine = await Fine.findOne();
    if (!fine) {
      fine = new Fine();
    }
    fine.amountCollected += fineAmount;
    await fine.save();

    await addNotification(`Fine of ₱${fineAmount} added.`);
    res.status(200).json({ amountCollected: fine.amountCollected });
  } catch (error) {
    console.error('Error adding fine:', error);
    res.status(500).json({ message: 'Failed to add fine' });
  }
});

// Get notifications route
app.get('/api/notifications', async (req, res) => {
  const notifications = await Notification.find().sort({ date: -1 }).limit(10);
  res.json(notifications);
});

// Get fines summary
app.get('/api/fines', async (req, res) => {
  try {
    let fine = await Fine.findOne();
    if (!fine) fine = { amountCollected: 0 };
    res.json({ amountCollected: fine.amountCollected });
  } catch (error) {
    console.error('Failed to fetch fine summary', error);
    res.status(500).json({ amountCollected: 0 });
  }
});

app.listen(PORT, async () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  await connectDB();
});

async function addFineToAmountCollected(fineAmount) {
  try {
    let fine = await Fine.findOne();
    if (!fine) {
      fine = new Fine();
    }
    fine.amountCollected += fineAmount;
    await fine.save();
  } catch (error) {
    console.error('Error adding fine to amount collected:', error);
  }
}

async function addNotification(message) {
  try {
    const notification = new Notification({ message });
    await notification.save();
  } catch (error) {
    console.error('Error adding notification:', error);
  }
}