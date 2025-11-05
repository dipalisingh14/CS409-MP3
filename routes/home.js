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
        try {
            if (req.query.where) query.where = JSON.parse(req.query.where);
            if (req.query.sort) options.sort = JSON.parse(req.query.sort);
            if (req.query.select) options.select = JSON.parse(req.query.select);
        } catch (err) {
            throw new Error('Invalid JSON in query parameter');
        }
        if (req.query.skip) options.skip = parseInt(req.query.skip);
        if (req.query.limit) options.limit = parseInt(req.query.limit);
        return { query, options };
    }

    //USERS

    // GET /users
    router.get('/users', async (req, res) => {
        try {
            const { query, options } = parseQueryParams(req);
            const limit = options.limit ?? 0; 
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
            res.status(400).json({ message: err.message, data: null });
        }
    });

    // GET /users/:id
    router.get('/users/:id', async (req, res) => {
        try {
            const user = await User.findById(req.params.id).select(req.query.select ?? '');
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

            const newUser = new User({
                name,
                email,
                pendingTasks: pendingTasks ?? [],
                dateCreated: new Date() 
            });
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

            // Update user's tasks: remove assignments that are no longer in pendingTasks
            if (pendingTasks) {
                const tasksToRemove = user.pendingTasks.filter(tid => !pendingTasks.includes(tid));
                const tasksToAdd = pendingTasks.filter(tid => !user.pendingTasks.includes(tid));

                // Remove old tasks assigned to this user
                if (tasksToRemove.length > 0) {
                    await Task.updateMany(
                        { _id: { $in: tasksToRemove } },
                        { $set: { assignedUser: '', assignedUserName: 'unassigned' } }
                    );
                }

                // Add new tasks assigned to this user
                if (tasksToAdd.length > 0) {
                    await Task.updateMany(
                        { _id: { $in: tasksToAdd } },
                        { $set: { assignedUser: user._id, assignedUserName: user.name } }
                    );
                }

                user.pendingTasks = pendingTasks;
            }

            user.name = name;
            user.email = email;

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

    //TASKS 

    // GET /tasks
    router.get('/tasks', async (req, res) => {
        try {
            const { query, options } = parseQueryParams(req);
            const limit = options.limit ?? 100;
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
            res.status(400).json({ message: err.message, data: null });
        }
    });

    // GET /tasks/:id
    router.get('/tasks/:id', async (req, res) => {
        try {
            const task = await Task.findById(req.params.id).select(req.query.select ?? '');
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
            let userId = '';
            if (assignedUser) {
                const user = await User.findById(assignedUser);
                if (user) {
                    assignedUserName = user.name;
                    userId = user._id;
                    user.pendingTasks.push(userId); // add task id to user pendingTasks
                    await user.save();
                }
            }

            const newTask = new Task({
                name,
                description: description ?? '',
                deadline,
                completed: completed ?? false,
                assignedUser: userId,
                assignedUserName,
                dateCreated: new Date()
            });

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
            if (assignedUser !== undefined && assignedUser != task.assignedUser) {
                // Remove task from old user's pendingTasks
                if (task.assignedUser) {
                    const oldUser = await User.findById(task.assignedUser);
                    if (oldUser) {
                        oldUser.pendingTasks = oldUser.pendingTasks.filter(tid => tid != task._id.toString());
                        await oldUser.save();
                    }
                }

                // Assign to new user if exists
                if (assignedUser) {
                    const newUser = await User.findById(assignedUser);
                    if (newUser) {
                        task.assignedUser = newUser._id;
                        task.assignedUserName = newUser.name;
                        newUser.pendingTasks.push(task._id);
                        await newUser.save();
                    } else {
                        task.assignedUser = '';
                        task.assignedUserName = 'unassigned';
                    }
                } else {
                    task.assignedUser = '';
                    task.assignedUserName = 'unassigned';
                }
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
                    user.pendingTasks = user.pendingTasks.filter(tid => tid != task._id.toString());
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
