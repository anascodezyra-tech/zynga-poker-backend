# Zynga Poker Chip Management System - Backend

Production-grade Node.js + Express + MongoDB Atlas backend for managing poker chip transactions at scale (up to 20 trillion chips per day).

## 🚀 Features

- **JWT Authentication** with role-based access control (Admin/Player)
- **Atomic Transactions** using MongoDB sessions
- **Idempotency** protection to prevent duplicate operations
- **Real-time Updates** via Socket.io
- **Redis Caching** for balance queries
- **BullMQ Queue** for bulk CSV transfers
- **CSV Import/Export** for transaction management
- **Audit Trail** with IP, user agent, and admin tracking
- **Rate Limiting** on all endpoints
- **Input Validation** and sanitization
- **Comprehensive Logging** with Winston

## 📋 Prerequisites

- Node.js 18+ 
- MongoDB Atlas account
- Redis server (local or cloud)
- Environment variables configured

## 🛠️ Installation

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Create `.env` file:**
   ```env
   # Server
   PORT=5000
   NODE_ENV=production

   # MongoDB
   MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/zynga_poker?retryWrites=true&w=majority

   # JWT
   JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
   JWT_EXPIRE=1d

   # Redis
   REDIS_HOST=localhost
   REDIS_PORT=6379
   REDIS_PASSWORD=

   # Logging
   LOG_LEVEL=info
   ```

3. **Create required directories:**
   ```bash
   mkdir -p uploads exports logs
   ```

4. **Start Redis server:**
   ```bash
   # Local
   redis-server

   # Or use cloud Redis (Redis Cloud, AWS ElastiCache, etc.)
   ```

5. **Start the server:**
   ```bash
   npm run dev
   ```

## 📁 Project Structure

```
backend/
├── config/
│   ├── redis.js          # Redis connection
│   └── queue.js          # BullMQ queue setup
├── controllers/
│   ├── authController.js
│   ├── balanceController.js
│   ├── transferController.js
│   ├── transactionController.js
│   ├── dailyMintController.js
│   └── bulkTransferController.js
├── middleware/
│   ├── authMiddleware.js
│   ├── idempotency.js
│   ├── rateLimiter.js
│   ├── validation.js
│   └── audit.js
├── models/
│   ├── User.js
│   └── Transaction.js
├── routes/
│   ├── authRoutes.js
│   ├── balanceRoutes.js
│   ├── transferRoutes.js
│   ├── transactionRoutes.js
│   └── dailyMintRoute.js
├── utils/
│   ├── cache.js          # Redis cache utilities
│   ├── csvHandler.js    # CSV import/export
│   └── logger.js         # Winston logger
├── workers/
│   └── bulkTransferWorker.js  # BullMQ worker
├── uploads/              # Temporary CSV uploads
├── exports/              # Generated CSV exports
├── logs/                 # Application logs
├── server.js
└── package.json
```

## 🔌 API Endpoints

### Authentication

**POST /api/login**
- Authenticate user and receive JWT token
- Body: `{ email, password }`
- Returns: `{ token, role, user }`

### Balance

**GET /api/balance**
- Admin: Returns all users with balances
- Player: Returns own balance only
- Headers: `Authorization: Bearer <token>`

### Transfers

**POST /api/transfer**
- Admin: Manual transfer between users
- Player: Submit transfer request
- Headers: `Authorization: Bearer <token>`, `Idempotency-Key: <unique-key>`
- Body: `{ toUserId, fromUserId (Admin only), amount, type, reason }`

**POST /api/transfer/reverse**
- Admin only: Reverse an approved transaction
- Body: `{ transactionId, reason }`

**POST /api/transfer/bulk**
- Admin only: Upload CSV for bulk transfers
- Content-Type: `multipart/form-data`
- File: CSV with columns: `fromUserId, toUserId, amount, reason`

### Transactions

**GET /api/transactions**
- List transactions with filters
- Query params: `type`, `status`, `fromDate`, `toDate`, `userId` (Admin only), `page`, `limit`
- Admin: All transactions
- Player: Own transactions only

**GET /api/transactions/export**
- Export transactions as CSV
- Same query params as GET /api/transactions

### Daily Mint

**POST /api/daily-mint**
- Admin only: Mint chips to all users
- Body: `{ amountPerUser }` (optional, defaults to 10000)

## 🔒 Security Features

- **JWT Authentication**: Secure token-based auth
- **bcrypt Password Hashing**: Passwords never stored in plain text
- **Rate Limiting**: Prevents brute force attacks
- **Input Validation**: All inputs validated and sanitized
- **Role-Based Access**: Admin/Player permissions enforced
- **Idempotency Keys**: Prevents duplicate operations
- **Audit Trail**: All admin actions logged with IP and user agent

## ⚡ Performance & Scaling

### Redis Caching
- Balance queries cached for 5 minutes
- Automatic cache invalidation on balance updates
- Reduces database load significantly

### BullMQ Queue
- Bulk transfers processed asynchronously
- Prevents server overload on large CSV imports
- Automatic retry on failures
- Job status tracking

### MongoDB Optimization
- Indexes on frequently queried fields
- Decimal128 for precise large number handling
- Atomic transactions using sessions
- Immutable transaction logs

## 🧪 Reconciliation Test

To verify Redis cache consistency with MongoDB:

```javascript
// Test script: test-reconciliation.js
import mongoose from "mongoose";
import User from "./models/User.js";
import redis from "./config/redis.js";

const testReconciliation = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  
  const users = await User.find();
  let mismatches = 0;
  
  for (const user of users) {
    const dbBalance = user.balance.toString();
    const cachedBalance = await redis.get(`balance:${user._id}`);
    
    if (cachedBalance) {
      const cached = JSON.parse(cachedBalance);
      if (cached.balance !== dbBalance) {
        console.log(`Mismatch for user ${user._id}: DB=${dbBalance}, Cache=${cached.balance}`);
        mismatches++;
      }
    }
  }
  
  console.log(`Reconciliation complete. Mismatches: ${mismatches}/${users.length}`);
  process.exit(0);
};

testReconciliation();
```

Run: `node test-reconciliation.js`

## 📊 Monitoring

- **Logs**: Check `logs/combined.log` and `logs/error.log`
- **Redis**: Monitor cache hit rates
- **BullMQ**: Check queue status via Bull Board (optional)
- **MongoDB**: Monitor connection pool and query performance

## 🔧 Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `MONGO_URI` | MongoDB Atlas connection string | Yes |
| `JWT_SECRET` | Secret key for JWT tokens | Yes |
| `REDIS_HOST` | Redis server host | Yes |
| `REDIS_PORT` | Redis server port | No (default: 6379) |
| `REDIS_PASSWORD` | Redis password (if required) | No |
| `PORT` | Server port | No (default: 5000) |
| `LOG_LEVEL` | Logging level (error/warn/info/debug) | No (default: info) |

## 🚦 Rate Limits

- **Login**: 5 attempts per 15 minutes
- **Transfer**: 10 requests per minute
- **General API**: 100 requests per 15 minutes

## 📝 CSV Format for Bulk Transfer

```csv
fromUserId,toUserId,amount,reason
507f1f77bcf86cd799439011,507f191e810c19729de860ea,1000,Payment
,507f191e810c19729de860ea,5000,Credit
```

- `fromUserId`: Optional (null = credit from system)
- `toUserId`: Required
- `amount`: Required, positive number
- `reason`: Optional

## 🐛 Error Handling

All errors are logged and return appropriate HTTP status codes:
- `400`: Bad Request (validation errors)
- `401`: Unauthorized (missing/invalid token)
- `403`: Forbidden (insufficient permissions)
- `404`: Not Found
- `409`: Conflict (idempotency key already used)
- `500`: Internal Server Error

## 🔄 Real-time Events (Socket.io)

Clients can listen for:
- `balanceUpdated`: Emitted when balances change
- `transactionCreated`: Emitted when new transaction is created
- `dailyMintCompleted`: Emitted when daily mint finishes

## 📈 Scaling Notes

### For 20 Trillion Chips/Day:

1. **Database Sharding**: Consider sharding transactions collection by date
2. **Redis Cluster**: Use Redis Cluster for high availability
3. **Load Balancing**: Deploy multiple server instances behind load balancer
4. **Connection Pooling**: MongoDB connection pool size: 50-100
5. **Worker Scaling**: Run multiple BullMQ workers for bulk transfers
6. **CDN**: Serve static exports via CDN
7. **Monitoring**: Set up APM (Application Performance Monitoring)

### Recommended Infrastructure:

- **MongoDB Atlas**: M30+ cluster with read replicas
- **Redis**: Redis Cloud or AWS ElastiCache (3+ GB)
- **Server**: 4+ CPU cores, 8+ GB RAM per instance
- **Load Balancer**: AWS ALB or similar

## 🧹 Maintenance

- **Log Rotation**: Implement log rotation (use winston-daily-rotate-file)
- **Cache Cleanup**: Redis automatically expires keys
- **Queue Cleanup**: BullMQ auto-removes completed jobs after 24h
- **CSV Cleanup**: Implement cron job to delete old uploads/exports

## 📄 License

ISC

## 👥 Support

For issues or questions, check logs in `logs/` directory.

