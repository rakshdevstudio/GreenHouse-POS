# 🏬 GreenHouse POS  
### Cloud-Based Multi-Store CRM & Smart Billing System

🚀 A production-ready, cloud-integrated CRM and billing infrastructure built for a vegetable supermarket chain.

🔗 **Live Preview:** https://green-house-pos.vercel.app

---

# 📌 Introduction

GreenHouse POS is an intelligent, multi-store retail management system designed for high-efficiency supermarket operations.

It integrates:

- ⚖️ Digital weighing scale automation  
- 🖨️ Direct printer integration  
- 🏪 Multi-store & multi-counter management  
- 📊 Sales trend analytics  
- ☁️ Cloud-based centralized data  
- 🔐 Admin control panel  

This system eliminates manual errors and optimizes checkout workflows across multiple branches.

---

# 🚀 Core Features

## ⚖️ Smart Weighing Scale Integration
- Real-time digital scale integration
- Automatically fetches weight directly into billing screen
- No manual entry required
- Reduces checkout time & human error

## 🖨 Printer Integration
- Instant receipt printing
- Data-URI hybrid receipt rendering
- Fixed blank receipt issue in production
- Stable printer communication

## 🏪 Multi-Store Architecture
- 6 Stores supported
- Each store contains 6 billing counters
- Store-specific billing records
- Isolated operational logic

## 👥 Admin Panel
- Centralized admin dashboard
- Manage store access
- Control product permissions
- Access billing history across all branches
- Monitor system activity

## 📦 Product Management
- Add / Edit / Delete products
- Stock monitoring system
- Low-stock tracking
- Real-time availability validation

## 📊 Billing History
- Store-wise billing records
- Counter-wise tracking
- Searchable invoice records
- Transaction logs

## 📈 Product Trend Analytics
- Day-wise sales trend
- Month-wise sales tracking
- Year-wise performance analysis
- Identify high-performing & low-performing products

## ☁️ Cloud Integrated
- Centralized database
- Remote access across branches
- Real-time data synchronization
- Scalable architecture

---

# 🏗 System Architecture
Stores (6 Locations)
↓
Counters (6 per Store)
↓
Frontend (React + Vite)
↓
REST API Layer (Node.js)
↓
Business Logic Engine
↓
Cloud Database
↓
Admin Dashboard

---

# 🛠 Technology Stack

## 💻 Frontend
- React
- Vite
- JavaScript
- CSS

## ⚙ Backend
- Node.js
- Express.js

## 🗄 Database
- SQL-based structured database
- Backup & migration scripts included

## ☁ Deployment
- Vercel (Frontend)
- Railway (Backend)
- Cloud-based hosting

## 🔌 Hardware Integrations
- Digital Weighing Scale
- Thermal Receipt Printer

