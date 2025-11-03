// module.exports = function (router) {

//     var homeRoute = router.route('/');

//     homeRoute.get(function (req, res) {
//         var connectionString = process.env.TOKEN;
//         res.json({ message: 'My connection string is ' + connectionString });
//     });

//     return router;
// }


const User = require('../models/user');
const Task = require('../models/task');

module.exports = function(router) {

    // Helper to parse query parameters
    function parseQueryParams(req) {
        const query = {};
        const options = {};
        if (req.query.where) query.where = JSON.parse(req.query.where);
        if (req.query.sort) options.sort = JSON.parse(req.query.sort);
        if (req.query.select) options.select = JSON.parse(req.query.select);
        if (req.query.skip) options.skip = parseInt(req.query.skip);
        if (req.query.limit) options.limit = parseInt(req.query.limit);
        return { query, options };
    }

    /** ---------- USERS ---------- **/

    // GET /users
    router.get('/users', async (req, res) => {
        try {
            const { query, options } = parseQueryParams(req);
            const limit = options.limit ?? 0; // unlimited for users
            if (req.query.count === 'true') {
                const count = await User.countDocuments(query.where ?? {});
                return res.json({ message: 'OK', data: count });
            }
            const users = await User.find(query.where ?? {}, options.select, {
                sort: options.sort,
                skip: options.skip,
                limit
            });
            res.json({ message: 'OK', data: users });
        } catch (err) {
            res.status(500).json({ message: 'Server error', data: err.message });
        }
    });

    // GET /users/:id
    router.get('/users/:id', async (req, res) => {
        try {
            const user = await User.findById(req.params.id).select(req.query.select);
            if (!user) return res.status(404).json({ message: 'User not found', data: null });
            res.json({ message: 'OK', data: user });
        } catch (err) {
            res.status(500).json({ message: 'Server error', data: err.message });
        }
    });

    // POST /users
    router.post('/users', async (req, res) => {
        try {
            const { name, email, pendingTasks } = req.body;
            if (!name || !email) return res.status(400).json({ message: 'Name and email are required', data: null });
            
            const exists = await User.findOne({ email });
            if (exists) return res.status(400).json({ message: 'User with this email already exists', data: null });

            const newUser = new User({ name, email, pendingTasks: pendingTasks ?? [] });
            const saved = await newUser.save();
            res.status(201).json({ message: 'User created', data: saved });
        } catch (err) {
            res.status(500).json({ message: 'Server error', data: err.message });
        }
    });

    // PUT /users/:id
    router.put('/users/:id', async (req, res) => {
        try {
            const { name, email, pendingTasks } = req.body;
            if (!name || !email) return res.status(400).json({ message: 'Name and email are required', data: null });

            const user = await User.findById(req.params.id);
            if (!user) return res.status(404).json({ message: 'User not found', data: null });

            // update pendingTasks if provided
            user.name = name;
            user.email = email;
            user.pendingTasks = pendingTasks ?? [];

            const saved = await user.save();
            res.json({ message: 'User updated', data: saved });
        } catch (err) {
            res.status(500).json({ message: 'Server error', data: err.message });
        }
    });

    // DELETE /users/:id
    router.delete('/users/:id', async (req, res) => {
        try {
            const user = await User.findById(req.params.id);
            if (!user) return res.status(404).json({ message: 'User not found', data: null });

            // Remove pendingTasks references in Task collection
            await Task.updateMany(
                { assignedUser: user._id },
                { $set: { assignedUser: '', assignedUserName: 'unassigned' } }
            );

            await user.deleteOne();
            res.status(204).json({ message: 'User deleted', data: null });
        } catch (err) {
            res.status(500).json({ message: 'Server error', data: err.message });
        }
    });

    /** ---------- TASKS ---------- **/

    // GET /tasks
    router.get('/tasks', async (req, res) => {
        try {
            const { query, options } = parseQueryParams(req);
            const limit = options.limit ?? 100; // default 100
            if (req.query.count === 'true') {
                const count = await Task.countDocuments(query.where ?? {});
                return res.json({ message: 'OK', data: count });
            }
            const tasks = await Task.find(query.where ?? {}, options.select, {
                sort: options.sort,
                skip: options.skip,
                limit
            });
            res.json({ message: 'OK', data: tasks });
        } catch (err) {
            res.status(500).json({ message: 'Server error', data: err.message });
        }
    });

    // GET /tasks/:id
    router.get('/tasks/:id', async (req, res) => {
        try {
            const task = await Task.findById(req.params.id).select(req.query.select);
            if (!task) return res.status(404).json({ message: 'Task not found', data: null });
            res.json({ message: 'OK', data: task });
        } catch (err) {
            res.status(500).json({ message: 'Server error', data: err.message });
        }
    });

    // POST /tasks
    router.post('/tasks', async (req, res) => {
        try {
            const { name, description, deadline, completed, assignedUser } = req.body;
            if (!name || !deadline) return res.status(400).json({ message: 'Name and deadline are required', data: null });

            let assignedUserName = 'unassigned';
            if (assignedUser) {
                const user = await User.findById(assignedUser);
                if (user) {
                    assignedUserName = user.name;
                    user.pendingTasks.push(name); // add task to user
                    await user.save();
                }
            }

            const newTask = new Task({ name, description, deadline, completed, assignedUser, assignedUserName });
            const saved = await newTask.save();
            res.status(201).json({ message: 'Task created', data: saved });
        } catch (err) {
            res.status(500).json({ message: 'Server error', data: err.message });
        }
    });

    // PUT /tasks/:id
    router.put('/tasks/:id', async (req, res) => {
        try {
            const { name, description, deadline, completed, assignedUser } = req.body;
            if (!name || !deadline) return res.status(400).json({ message: 'Name and deadline are required', data: null });

            const task = await Task.findById(req.params.id);
            if (!task) return res.status(404).json({ message: 'Task not found', data: null });

            // Update assigned user references
            if (assignedUser && assignedUser !== task.assignedUser) {
                // Remove from old user pendingTasks
                if (task.assignedUser) {
                    const oldUser = await User.findById(task.assignedUser);
                    if (oldUser) {
                        oldUser.pendingTasks = oldUser.pendingTasks.filter(tid => tid !== task._id.toString());
                        await oldUser.save();
                    }
                }
                // Add to new user pendingTasks
                const newUser = await User.findById(assignedUser);
                if (newUser) {
                    newUser.pendingTasks.push(task._id.toString());
                    await newUser.save();
                    task.assignedUserName = newUser.name;
                } else {
                    task.assignedUserName = 'unassigned';
                }
                task.assignedUser = assignedUser;
            }

            task.name = name;
            task.description = description ?? '';
            task.deadline = deadline;
            task.completed = completed ?? false;

            const saved = await task.save();
            res.json({ message: 'Task updated', data: saved });
        } catch (err) {
            res.status(500).json({ message: 'Server error', data: err.message });
        }
    });

    // DELETE /tasks/:id
    router.delete('/tasks/:id', async (req, res) => {
        try {
            const task = await Task.findById(req.params.id);
            if (!task) return res.status(404).json({ message: 'Task not found', data: null });

            // Remove task from assigned user's pendingTasks
            if (task.assignedUser) {
                const user = await User.findById(task.assignedUser);
                if (user) {
                    user.pendingTasks = user.pendingTasks.filter(tid => tid !== task._id.toString());
                    await user.save();
                }
            }

            await task.deleteOne();
            res.status(204).json({ message: 'Task deleted', data: null });
        } catch (err) {
            res.status(500).json({ message: 'Server error', data: err.message });
        }
    });

    return router;
};
