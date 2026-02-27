# Teach Bound: Digital Whiteboard for Education and Collaboration

**An intuitive, web-based whiteboard for dynamic teaching, collaborative brainstorming, and visual learning. Open source, ad-free, and 100% free to use.**

Teach Bound aims to provide a simple, yet powerful, digital canvas for educators, students, and teams to create, share, and engage with ideas visually.

---

## Try Teach Bound Live!

Experience Teach Bound directly in your browser:
**[https://teachbound.com](https://teachbound.com)**
![Teach Bound screenshot](https://github.com/user-attachments/assets/ab02e556-158b-42f1-8885-7124cea6dfa6)

---

## Overview

Teach Bound is an open-source digital whiteboard application built with JavaScript (React), designed to foster creativity and interaction in educational and professional settings. Whether you're sketching concepts, organizing thoughts with notes, or illustrating complex topics, Teach Bound offers a user-friendly platform for your digital workspace. Our vision is to provide a streamlined, accessible, and ad-free alternative for anyone seeking an effective digital whiteboard.

## Key Features

- **Versatile Drawing Tools:**
  - **Pen:** Smooth freehand drawing with selectable colors and line widths
  - **Eraser:** Easily clear pen strokes
  - **Selection Tool:** Select, move, and manage multiple elements
- **Rich Content Creation:**
  - **Sticky Notes:** Add, edit, and move digital sticky notes
  - **Text Tool:** Insert formatted text directly onto the canvas
  - **Shapes:** Draw rectangles, circles, lines, and arrows to structure information
- **Element Management:**
  - **Selection Tool:** Select, move, and manage elements on the board
  - **Delete Selected:** Remove selected elements from the canvas
  - **Undo/Redo:** Navigate through your action history
- **Export & Share:**
  - **Download as PNG:** Save your work as high-quality images (1x, 2x, 3x resolution)
  - **Download as PDF:** Export your whiteboard for printing or sharing
- **Professional Interface:**
  - **Responsive Design:** Adapts to various screen sizes for a seamless experience
  - **Customizable Toolbar:** Choose between icons only, icons with text, or text only display
  - **Clear Frame:** Instantly reset the canvas

## Tech Stack

- **Frontend Framework:** React.js
- **Styling:** Custom CSS with responsive design
- **Icons:** Lucide React
- **Font:** Open Sans
- **Hosting:** Vercel
- **Development:** Built using vibe coding techniques with Claude and Gemini AI assistants

## Getting Started

### Use Online

1. Visit [https://teachbound.com](https://teachbound.com)
2. Select your desired tool from the toolbar
3. Click and drag on the canvas to create!
4. Use options for colors, line width, and font size to customize

### Run Locally

1. Clone the repository:

   ```bash
   git clone https://github.com/Student-Team-Projects/TeachBound
   cd TeachBound
   ```

2. Install dependencies (client):

   ```bash
   cd TeachBound-client
   npm install
   ```

3. (Optional) Start the P2P relay/bootstrap node (default port 9090):

   ```bash
   cd ../TeachBound-host
   npm install
   npm start
   ```

   The host will print its peer ID and multiaddr, e.g.:
   ```
   [TeachBound-host] Peer ID: 12D3KooW...
   [TeachBound-host] For client .env:
     REACT_APP_P2P_RELAY_ADDR=/ip4/127.0.0.1/tcp/9090/ws/p2p/12D3KooW...
   ```

4. (Optional) Enable P2P collaboration in the client:
   - Create `TeachBound-client/.env` (this file is intentionally ignored by git)
   - Add:

     ```bash
     # Copy the multiaddr from the host output (includes the peer ID)
     REACT_APP_P2P_SIGNALING_ADDR=/ip4/127.0.0.1/tcp/9090/ws/p2p/<HOST_PEER_ID>

     # Optional: room id (maps to pubsub topic `teachbound/<room>`)
     REACT_APP_P2P_ROOM=demo
     ```

   - Restart the client after changing `.env`
   - Open the app in multiple browser tabs to test P2P sync

5. Start the client development server:

   ```bash
   cd ../TeachBound-client
   npm start
   ```

6. Open [http://localhost:3000](http://localhost:3000) in your browser

## Contribution

We believe in the power of open-source and warmly welcome contributions! Whether it's a bug report, feature suggestion, or a pull request, your input is valuable.

### How to Contribute

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## About the Developer

Teach Bound is developed and maintained by **Sai Gattupalli, PhD**, College of Education, University of Massachusetts Amherst.

Created for educators, by an educator who understands the needs of modern teaching and learning environments.

## License

Teach Bound is licensed under the **Creative Commons Attribution-NonCommercial 4.0 International License (CC BY-NC 4.0)**.

This means:

- ✅ You can use, share, and adapt the software for non-commercial purposes
- ✅ You must give appropriate credit
- ❌ Commercial use is not permitted without permission

[Learn more about the license](http://creativecommons.org/licenses/by-nc/4.0/)

## Support

For questions, suggestions, or support:

- Open an issue on [GitHub](https://github.com/Student-Team-Projects/TeachBound/issues)
- Visit our website: [https://teachbound.com](https://teachbound.com)

---

**Made with ❤️ for the education community**
