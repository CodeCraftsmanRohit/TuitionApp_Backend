import postModel from '../models/postmodel.js';
import userModel from '../models/usermodel.js';

export const searchPosts = async (req, res) => {
  try {
    const {
      query = '',
      class: className,
      subject,
      board,
      minSalary,
      maxSalary,
      genderPreference,
      location,
      sortBy = 'newest',
      page = 1,
      limit = 20
    } = req.query;

    const userId = req.userId;
    const skip = (page - 1) * limit;

    // Build search filter
    let filter = {};

    // Text search across multiple fields
    if (query) {
      filter.$or = [
        { title: { $regex: query, $options: 'i' } },
        { subject: { $regex: query, $options: 'i' } },
        { address: { $regex: query, $options: 'i' } }
      ];
    }

    // Filter by specific fields
    if (className) filter.class = className;
    if (subject) filter.subject = { $regex: subject, $options: 'i' };
    if (board) filter.board = { $regex: board, $options: 'i' };
    if (genderPreference) filter.genderPreference = genderPreference;
    if (location) filter.address = { $regex: location, $options: 'i' };

    // Salary range filter
    if (minSalary || maxSalary) {
      filter.salary = {};
      if (minSalary) filter.salary.$gte = parseInt(minSalary);
      if (maxSalary) filter.salary.$lte = parseInt(maxSalary);
    }

    // Sort options
    let sort = {};
    switch (sortBy) {
      case 'salary_high':
        sort = { salary: -1 };
        break;
      case 'salary_low':
        sort = { salary: 1 };
        break;
      case 'popular':
        sort = { 'likes': -1 };
        break;
      case 'newest':
      default:
        sort = { createdAt: -1 };
        break;
    }

    const posts = await postModel.find(filter)
      .populate('createdBy', 'name profilePhoto')
      .populate('likes.user', 'name profilePhoto')
      .populate('comments.user', 'name profilePhoto')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    // Add interaction data for current user
    const postsWithInteractions = posts.map(post => {
      const postObj = post.toObject();
      postObj.isLiked = post.likes.some(like =>
        like.user && like.user._id.toString() === userId
      );
      postObj.likesCount = post.likes.length;
      postObj.commentsCount = post.comments.length;
      return postObj;
    });

    const total = await postModel.countDocuments(filter);

    // Get search suggestions/facets
    const facets = await getSearchFacets(filter);

    res.json({
      success: true,
      posts: postsWithInteractions,
      facets,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Search posts error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getSearchSuggestions = async (req, res) => {
  try {
    const { query } = req.query;

    if (!query || query.length < 2) {
      return res.json({ success: true, suggestions: [] });
    }

    // Search across multiple fields for suggestions
    const posts = await postModel.find({
      $or: [
        { title: { $regex: query, $options: 'i' } },
        { subject: { $regex: query, $options: 'i' } },
        { class: { $regex: query, $options: 'i' } },
        { board: { $regex: query, $options: 'i' } }
      ]
    })
    .select('title subject class board')
    .limit(10);

    const suggestions = [
      ...new Set([
        ...posts.map(p => p.title),
        ...posts.map(p => p.subject),
        ...posts.map(p => p.class),
        ...posts.map(p => p.board)
      ])
    ].slice(0, 8);

    res.json({
      success: true,
      suggestions
    });
  } catch (error) {
    console.error('Get search suggestions error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Helper function to get search facets
async function getSearchFacets(filter) {
  const facets = await postModel.aggregate([
    { $match: filter },
    {
      $facet: {
        classes: [
          { $group: { _id: '$class', count: { $sum: 1 } } },
          { $sort: { count: -1 } }
        ],
        subjects: [
          { $group: { _id: '$subject', count: { $sum: 1 } } },
          { $sort: { count: -1 } }
        ],
        boards: [
          { $group: { _id: '$board', count: { $sum: 1 } } },
          { $sort: { count: -1 } }
        ],
        salaryRange: [
          {
            $group: {
              _id: null,
              minSalary: { $min: '$salary' },
              maxSalary: { $max: '$salary' }
            }
          }
        ]
      }
    }
  ]);

  return facets[0];
}